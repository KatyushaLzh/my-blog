# Errors

Command failures and integration errors.

---

## [ERR-20260625-001] start-process-pnpm-shim

**Logged**: 2026-06-25T23:35:00+08:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
PowerShell `Start-Process -FilePath 'pnpm'` failed on Windows because the pnpm shim is not a direct Win32 executable.

### Error
```
This command cannot be run due to the error: %1 is not a valid Win32 application.
```

### Context
- Command attempted: launch `pnpm dev --host 127.0.0.1` as a background process.
- Environment: Windows PowerShell in the Mizuki blog workspace.
- Working command: use `Start-Process -FilePath 'pnpm.cmd' ...`.

### Suggested Fix
When starting pnpm in a Windows background process, call `pnpm.cmd` instead of `pnpm`.

### Metadata
- Reproducible: yes
- Related Files: package.json

---

