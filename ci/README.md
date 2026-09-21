# Workflows

These belong in `.github/workflows/`. They live here only because workflow
files cannot be written by remote tooling. Move them once:

```powershell
Move-Item ci\workflows\*.yml .github\workflows\ -Force
Remove-Item .github\workflows\spike-ci-reachability.yml
```

The spike workflow is removed because its question is answered: GitHub runners
cannot reach stats.nba.com, which is why the pipeline reads from the mirror.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | every push and PR | lint, tests, schema and type drift checks, validates committed data |
| `refresh-data.yml` | daily May to Oct, weekly otherwise, or manual | rebuilds `data/v1`, commits only if the data changed |

One repository setting is required for the refresh to push:
Settings > Actions > General > Workflow permissions > **Read and write permissions**.
