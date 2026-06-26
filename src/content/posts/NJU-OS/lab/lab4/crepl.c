#include <stdio.h>
#include <stdbool.h>
#include <dlfcn.h>
#include <unistd.h>
#include <sys/wait.h>
#include <string.h>
#include <stdlib.h>
#include <readline/readline.h>
#include <readline/history.h>

const char C_PATH[] = "/tmp/tmp.c";
char SO_PATH[1 << 16], _buffer[1 << 16];
extern char ** environ;

char *fun_sig[105];
int fun_cnt = 0;
// Compile a function definition and load it
bool compile_and_load_function(const char* function_def) {
    FILE *fp = fopen(C_PATH, "w");
    for (int i = 0; i < fun_cnt; i++) {
        fprintf(fp, "%s\n", fun_sig[i]);
    }
    fprintf(fp, "%s\n", function_def);
    fclose(fp);  

    sprintf(SO_PATH, "/tmp/tmp%d.so", fun_cnt);
    int pid = fork();
    if (pid == 0) {
        const char *argv[] = {
            "gcc", "-shared", "-fPIC", C_PATH, "-o", SO_PATH, NULL
        };
        execve("/usr/bin/gcc", argv, environ);  
        _exit(1);      
    } else {
        int status;
        void *handle;
        if (waitpid(pid, &status, 0) < 0) return 0;
        if (!(WIFEXITED(status) && WEXITSTATUS(status) == 0)) return 0;
        if ((handle = dlopen(SO_PATH, RTLD_NOW | RTLD_GLOBAL)) == NULL) return 0; 
        int n = strlen(function_def);

        int ptr = 0;
        for (int i = 0; i < n; i++) {
            if (function_def[i] == '{') break;
            _buffer[ptr++] = function_def[i];
        }
        _buffer[ptr++] = ';';
        _buffer[ptr] = '\0';
        fun_sig[fun_cnt++] = (char *)malloc(sizeof(char) * (ptr + 1));
        memcpy(fun_sig[fun_cnt - 1], _buffer, ptr + 1);
    }

    return 1;
}

// Evaluate an expression
int expr_cnt = 0;
bool evaluate_expression(const char* expression, int* result) {
    int len = 0;
    for (int i = 0 ; i < fun_cnt; i++) {
        sprintf(_buffer + len, "%s\n", fun_sig[i]);
        len += strlen(fun_sig[i]) + 1;
    }
    sprintf(_buffer + len, "int expr(){return %s;}", expression);
    FILE *fp = fopen(C_PATH, "w");
    fprintf(fp, "%s", _buffer);
    fclose(fp);

    sprintf(SO_PATH, "/tmp/expr%d.so", expr_cnt);
    int pid = fork();
    if (pid == 0) {
        const char *argv[] = {
            "gcc", "-shared", "-fPIC", C_PATH, "-o", SO_PATH, NULL
        };
        execve("/usr/bin/gcc", argv, environ);
        _exit(1);
    } else {
        int status;
        void *handle;
        int (*fun)();
        if (waitpid(pid, &status, 0) < 0) return 0; 
        if (!(WIFEXITED(status) && WEXITSTATUS(status) == 0)) return 0;
        if ((handle = dlopen(SO_PATH, RTLD_NOW | RTLD_GLOBAL)) == NULL) return 0;
        if ((fun = dlsym(handle, "expr")) == NULL) return 0;
        ++expr_cnt;
        *result = fun();
    }
    return 1;
}

bool is_function(const char *buf) {
    if (strlen(buf) >= 3 && buf[0] == 'i' && buf[1] == 'n' && buf[2] == 't') return 1;
    return 0;
}


int main() {
    while (1) {
        char *buffer = readline("crepl>");
        if (buffer == NULL) break;
        add_history(buffer);
        int ptr = 0;
        while (ptr < (1 << 16) && buffer[ptr] == ' ') ptr++;
        char *_buffer = buffer + ptr;
        if (is_function(_buffer)) {
            if (compile_and_load_function(_buffer)) {
                printf("Ok, function added.\n");
            } else {
                printf("Function input error!\n");
            }
        }    
        else {
            int res;
            if (evaluate_expression(_buffer, &res)) {
                printf("Expression evaluated = %d.\n", res);
            } else {
                printf("Expression input error!\n");
            }
        }    
    }
}
