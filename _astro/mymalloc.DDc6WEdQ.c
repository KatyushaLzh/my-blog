#include <mymalloc.h>
#include <assert.h>
#include <threads.h>
#include <stdatomic.h>

//---------------------------------------------------free-list------------------------------------------------------
#define align4096(x) (((x) & 4095) ? (((x) & (~4095)) + 4096): (x)) 
#define align8(x) (((x) & 7) ? (((x) & (~7)) + 8): (x)) 

struct Node{
    struct Node *pre, *nxt;
    size_t size;
};
typedef struct Node Node;
static Node head[20], tail[20];
static int if_init[20];
static spinlock_t list_lock[20];

void init(size_t list_id) {
    if (if_init[list_id]) return;
    if_init[list_id] = 1;
    head[list_id].pre = NULL; head[list_id].nxt = &tail[list_id]; head[list_id].size = 0;
    tail[list_id].pre = &head[list_id]; tail[list_id].nxt = NULL; tail[list_id].size = 0;
}

int is_adj(Node *a, Node *b) {
    return ((void *)a + a->size == (void *)b);
}

void remove(Node *p) {
    p->pre->nxt = p->nxt;
    p->nxt->pre = p->pre;
    p->nxt = p->pre = NULL;
}

static Node *insert(size_t list_id, Node *p) {
    Node *i = head[list_id].nxt;
    while (i != &tail[list_id] && i < p) i = i->nxt;
    p->pre = i->pre; p->nxt = i;
    i->pre->nxt = p; i->pre = p; 

    Node *prev = p->pre, *nxt = p->nxt;
    if (prev != &head[list_id] && is_adj(prev, p)) {
        prev->size += p->size;
        remove(p);
        p = prev;
    }
    if (nxt != &tail[list_id] && is_adj(p, nxt)) {
        p->size += nxt->size;
        remove(nxt);
    }
    return p;
}

static Node *find_space(size_t list_id, size_t size) {
    for (Node *i = head[list_id].nxt; i != &tail[list_id]; i = i->nxt) {
        if (i->size >= size) {
            return i;
        }
    }
    return NULL;
}

static Node *apply(size_t list_id, size_t size) {
    size_t _size = align4096(size);
    _size = _size < 4096? 4096 : _size;
    Node *ptr = vmalloc(NULL, _size);
    ptr->size = _size;
    return insert(list_id, ptr);
}

static size_t getid(size_t size) {
    for (int i = 12; i < 20; i++) {
        if (size <= (1UL << i)) return i - 12;
    }
    return 19;
}

static void *split(size_t list_id, Node *p, size_t len) {
    size_t size = p->size;
    remove(p);
    if (size >= len + sizeof(Node) + 8) {
        p->size = len;
        size_t rem = size - len;
        Node *ptr = (void *)p + len;
        ptr->size = rem;
        insert(list_id, ptr);
    }
    return (void *)p + sizeof (Node);
}

static void *list_malloc(size_t list_id, size_t size) {
    spin_lock(&list_lock[list_id]);
    init(list_id);
    size_t _size = align8(size + sizeof(Node));
    Node *ptr = find_space(list_id, _size);
    if (ptr == NULL) ptr = apply(list_id, _size);
    void *ret = split(list_id, ptr, _size);
    spin_unlock(&list_lock[list_id]);
    return ret;
}

static void list_free(size_t list_id, void *ptr) {
    spin_lock(&list_lock[list_id]);
    Node *_ptr = (Node *)(ptr - sizeof(Node)); 
    insert(list_id, _ptr);
    spin_unlock(&list_lock[list_id]);
}
// ------------------------------------------------------slot--------------------------------------------------------
#define CLASS_NUM 7
#define SPAN_SIZE 4096
#define SPAN_MAGIC 0x0d000721
const size_t SIZE[] = {32, 64, 128, 256, 512, 1024, 2048};
struct span{
    size_t class_id, cap, size;
    //slot_size = SIZE[class_id]
    int magic;
    void *free_list;
    struct span *nxt;
};
typedef struct span span;

struct class {
    spinlock_t lock;
    span *full, *available;
};
typedef struct class class;
class classes[CLASS_NUM];

#define CACHE_BATCH 32
#define CACHE_VOLUM 64
struct threadcache {
    void *list[CLASS_NUM];
    size_t count[CLASS_NUM];
};
typedef struct threadcache threadcache;

static thread_local threadcache tcache; 

static void cache_push(size_t class, void *slot) {
    *(void **)slot = tcache.list[class];
    tcache.list[class] = slot;
    tcache.count[class]++;
}

static void *cache_pop(size_t class) {
    void *slot = tcache.list[class];
    if (slot != NULL) {
        tcache.list[class] = *(void **)slot;
        tcache.count[class]--;
    }
    return slot;
}

static void init_span(span *s, size_t class_id) {
    s->class_id = class_id;
    size_t slot_size = SIZE[class_id];
    s->free_list = (void *)(align8((unsigned long long)s + sizeof(span)));
    s->size = 0; s->magic = SPAN_MAGIC; s->cap = 0; s->nxt = NULL;
    for (void *p = s->free_list; p + slot_size <= (void *)s + SPAN_SIZE; p += slot_size) {
        s->cap++;
        if (p + slot_size + slot_size <= (void *)s + SPAN_SIZE) {
            *(void **)p = (void *)p + slot_size;
        } else {
            *(void **)p = NULL;
        }
    }
}

static void *apply_slot(span *s) {
    // assert(s->free_list != NULL);
    void *ret = s->free_list;
    s->free_list = *(void **)s->free_list;
    s->size++;
    return ret;
}

static size_t getclass(size_t size) {
    if (size <= 32) return 0;
    if (size <= 64) return 1;
    if (size <= 128) return 2;
    if (size <= 256) return 3;
    if (size <= 512) return 4;
    if (size <= 1024) return 5;
    if (size <= 2048) return 6;
    // asseret(0);
} 

static void *get_slot(size_t class) {
    if (classes[class].available == NULL) {
        classes[class].available = vmalloc(NULL, SPAN_SIZE);
        init_span(classes[class].available, class);
    }
    void *ret = apply_slot(classes[class].available);
    if (classes[class].available->size == classes[class].available->cap) {
        span *nxt = classes[class].available->nxt;
        classes[class].available->nxt = classes[class].full;
        classes[class].full = classes[class].available;
        classes[class].available = nxt;
    }
    return ret;
}

static void *slot_malloc(size_t size) {
    size_t _size = align8(size);
    size_t class = getclass(_size);
    void *ret;
    if (tcache.list[class] != NULL) {
        
    }
    else {
        spin_lock(&classes[class].lock);
        for (size_t i = 0; i < CACHE_BATCH; i++) {
            cache_push(class, get_slot(class));
        }
        spin_unlock(&classes[class].lock);
    }
    ret = cache_pop(class);
    return ret;
}

static void free_slot(size_t class, void *ptr) {
    span *s = (span *)((unsigned long long)ptr & (~(SPAN_SIZE - 1)));
    void *list_ptr = s->free_list;
    *(void **)ptr = s->free_list;
    s->free_list = ptr;
    s->size--;
    if (list_ptr == NULL) {
        span *p = classes[class].full;
        if (p == s) {
            classes[class].full = p->nxt;
        }
        else {
            for (; p != NULL && p->nxt != NULL; p = p->nxt) {
                if (p->nxt == s) {
                    p->nxt = p->nxt->nxt;
                    break;
                }
            }
        }
        s->nxt = classes[class].available;
        classes[class].available = s;
    }    
}

static void slot_free(void *ptr) {
    span *s = (span *)((unsigned long long)ptr & (~(SPAN_SIZE - 1)));
    size_t class = s->class_id;
    cache_push(class, ptr);
    if (tcache.count[class] > CACHE_VOLUM) {
        spin_lock(&classes[class].lock);
        for (size_t i = 0; i < CACHE_BATCH; i++) {
            void *slot = cache_pop(class);
            free_slot(class, slot);
        }
        spin_unlock(&classes[class].lock);
    }

    // if (s->size == 0) {
    //     span *p = classes[class].available;
    //     if (p == s) {
    //         classes[class].available = p->nxt;
    //         vmfree(p, SPAN_SIZE);
    //     }
    //     else {
    //         for (; p != NULL && p->nxt != NULL; p = p->nxt) {
    //             if (p->nxt == s) {
    //                 p->nxt->magic = 0;
    //                 span *nxt = p->nxt->nxt;
    //                 vmfree(p->nxt, SPAN_SIZE);
    //                 p->nxt = nxt; 
    //                 break;
    //             }
    //         }
    //     }
    // }
}

//------------------------------------------------------------API----------------------------------------------------
atomic_long malloc_count;
spinlock_t add_lock;
void *mymalloc(size_t size) {
    ++malloc_count;
    size_t _size = align8(size);
    if (_size > 2048) {
        void *ret;
        size_t id = getid(align8(size + sizeof(Node)));
        ret = list_malloc(id, size);
        return ret;
    } else {
        return slot_malloc(_size);
    }
}

spinlock_t free_lock;
void myfree(void *ptr) {
    span *span_ptr = ((unsigned long long)ptr & (~(SPAN_SIZE - 1)));
    int magic = span_ptr->magic;
    if (magic == SPAN_MAGIC) {
        slot_free(ptr);
    }
    else {
        spin_lock(&free_lock);
        Node *node_ptr = (Node *)(ptr - sizeof(Node));
        size_t size = node_ptr->size;
        spin_unlock(&free_lock);
        size_t id = getid(size);
        list_free(id, ptr);        
    }
}