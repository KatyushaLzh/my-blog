#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <assert.h>
#include <testkit.h>
#include "labyrinth.h"
#include <getopt.h>

int main(int argc, char *argv[]) {
    // TODO: Implement this function
    optind = 0;
    opterr = 0;
    optopt = 0;
    optarg = NULL;

    char *args[argc + 1];
    for (int i = 0; i < argc; i++) args[i] = argv[i];
    args[argc] = NULL;

    static struct option long_options[] = {
        {"map", required_argument, 0, 'm'},
        {"player", required_argument, 0, 'p'},
        {"version", no_argument, 0, 'v'},
        {"move", required_argument, 0, 'M'},
        {0, 0, 0, 0}
    };

    int opt;
    char *mp_path = NULL, *dir = NULL, *player = NULL;
    bool vers = 0;
    while ((opt = getopt_long(argc, args, "", long_options, NULL)) != -1) {
        switch (opt) {
            case 'm':
                if (vers) return 1; 
                mp_path = optarg;
                break;
            case 'p':
                if (vers) return 1;
                player = optarg;
                break;
            case 'v':
                vers = 1;
                if (mp_path != NULL || player != NULL || dir != NULL) return 1;
                break;
            case 'M':
                if (vers) return 1;
                dir = optarg;
                break;
            case '?':
                return 1;
            case ':':
                return 1;
        }
    }
    if (optind < argc && strcmp(args[optind], "./labyrinth") == 0) optind++;
    if (optind != argc) return 1;

    if (vers) {
        printVersion();
        return 0;
    }

    if (mp_path == NULL || player == NULL) return 1;
    if (strlen(player) >= 2 || !isValidPlayer(player[0])) return 1;

    Labyrinth mp = {0};
    if (!loadMap(&mp, mp_path)) return 1;
    if (!isConnected(&mp)) return 1;
    if (dir == NULL) {
        printMap(&mp);
        return 0;
    }
    if (!movePlayer(&mp, player[0], dir)) return 1;
    if (!saveMap(&mp, mp_path)) return 1;
    return 0;
}

void printVersion() {
    printf("This is Labyrinth Game\n");
}

void printUsage() {
    printf("Usage:\n");
    printf("  labyrinth --map map.txt --player id\n");
    printf("  labyrinth -m map.txt -p id\n");
    printf("  labyrinth --map map.txt --player id --move direction\n");
    printf("  labyrinth --version\n");
}

bool isValidPlayer(char playerId) {
    // TODO: Implement this function
    if ('0' <= playerId && playerId <= '9') return true;
    return false;
}

bool loadMap(Labyrinth *labyrinth, const char *filename) {
    // TODO: Implement this function
    if (labyrinth == NULL || filename == NULL) return false;
    FILE *fp = fopen(filename, "r");
    if (fp == NULL) return false;
    static char buf[1024];
    int expected_cols = -1;
    while (fgets(buf, sizeof(buf), fp) != NULL) {
        if (labyrinth->rows == MAX_ROWS) {
            fclose(fp);
            return false;
        }

        size_t len = strcspn(buf, "\n");
        if (buf[len] == '\n') buf[len] = '\0';
        if ((int)len > MAX_COLS) {
            fclose(fp);
            return false;
        }

        if (expected_cols == -1) expected_cols = (int)len;
        if ((int)len != expected_cols) {
            fclose(fp);
            return false;
        }

        labyrinth->cols = (int)len;
        memcpy(labyrinth->map[labyrinth->rows], buf, len + 1);
        labyrinth->rows++;
    }
    fclose(fp);
    return true;
}

Position findPlayer(Labyrinth *labyrinth, char playerId) {
    // TODO: Implement this function
    Position pos = {-1, -1};
    for (int i = 0; i < labyrinth->rows; i++) {
        for (int j = 0; j < labyrinth->cols; j++) {
            if (labyrinth->map[i][j] == playerId) {
                pos.row = i;
                pos.col = j;
            }
        }
    }
    return pos;
}

Position findFirstEmptySpace(Labyrinth *labyrinth) {
    // TODO: Implement this function
    for (int i = 0; i < labyrinth->rows; i++) {
        for (int j = 0; j < labyrinth->cols; j++) {
            if (labyrinth->map[i][j] == '.') {
                Position pos = {i, j};
                return pos;
            }
        }
    }
    Position pos = {-1, -1};
    return pos;
}

bool isEmptySpace(Labyrinth *labyrinth, int row, int col) {
    // TODO: Implement this function
    if (labyrinth == NULL) return false;
    if (row < 0 || row >= labyrinth->rows || col < 0 || col >= labyrinth->cols) {
        return false;
    }
    return (labyrinth->map[row][col] == '.');
}

const Position dir_table[] = {
        {-1, 0}, {1, 0}, {0, -1}, {0, 1}
};

bool movePlayer(Labyrinth *labyrinth, char playerId, const char *direction) {
    // TODO: Implement this function

    int dir_opt = -1;
    if (strcmp(direction, "up") == 0) dir_opt = 0;
    else if (strcmp(direction, "down") == 0) dir_opt = 1;
    else if (strcmp(direction, "left") == 0) dir_opt = 2;
    else if (strcmp(direction, "right") == 0) dir_opt = 3;
    else return false;

    Position dir = dir_table[dir_opt], pos = findPlayer(labyrinth, playerId);
    if (pos.row == -1) pos = findFirstEmptySpace(labyrinth);
    if (pos.row == -1) return false;
    Position _pos;
    _pos.row = pos.row + dir.row; _pos.col = pos.col + dir.col;
    if (!isEmptySpace(labyrinth, _pos.row, _pos.col)) return false;
    labyrinth->map[pos.row][pos.col] = '.';
    labyrinth->map[_pos.row][_pos.col] = playerId;
    return true;
}

bool saveMap(Labyrinth *labyrinth, const char *filename) {
    // TODO: Implement this function
    FILE *fp = fopen(filename, "w");
    if (fp == NULL) return false;
    for (int i = 0; i < labyrinth->rows; i++) {
        if (fputs(labyrinth->map[i], fp) == EOF) {
            fclose(fp);
            return false;
        }
        if (fputc('\n', fp) == EOF) {
            fclose(fp);
            return false;
        }
    }
    fclose(fp);
    return true;
}

bool printMap(Labyrinth *labyrinth) {
    // TODO: Implement this function
    for (int i = 0; i < labyrinth->rows; i++) {
        for (int j = 0; j < labyrinth->cols; j++) {
            putchar(labyrinth->map[i][j]);
        }
        putchar('\n');
    }
    return 1;
}

// Check if all empty spaces are connected using DFS
void dfs(Labyrinth *labyrinth, int row, int col, bool visited[MAX_ROWS][MAX_COLS]) {
    // TODO: Implement this function
    if (visited[row][col]) return;
    visited[row][col] = true;
    for (int i = 0; i < 4; i++) {
        int _row = row + dir_table[i].row, _col = col + dir_table[i].col;
        if (isEmptySpace(labyrinth, _row, _col)) dfs(labyrinth, _row, _col, visited);
    }
}

bool isConnected(Labyrinth *labyrinth) {
    // TODO: Implement this function
    static bool visited[MAX_ROWS][MAX_COLS];
    memset(visited, 0, sizeof visited);
    Position empty_pos = findFirstEmptySpace(labyrinth);
    if (empty_pos.row == -1) return true;
    dfs(labyrinth, empty_pos.row, empty_pos.col, visited);
    for (int i = 0; i < labyrinth->rows; i++) {
        for (int j = 0; j < labyrinth->cols; j++) {
            if (labyrinth->map[i][j] == '.' && !visited[i][j]) return false;
        }
    }
    return true;
}