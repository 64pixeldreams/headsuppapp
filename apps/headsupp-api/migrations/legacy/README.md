# Legacy Upgrade Patches

These patches are for upgrading older deployed databases that were created before the consolidated fresh schema.

Do not use these for new databases.

For fresh installs use:

```text
migrations/fresh/schema.sql
```

Legacy upgrade sequence:

```text
migrations/legacy/0002_correctness_closure.sql
migrations/legacy/0003_channel_contracts_and_read_apis.sql
migrations/legacy/0004_watch_actions_and_quiet_summaries.sql
migrations/legacy/0005_correctness_closure_runtime.sql
migrations/legacy/0006_channel_metadata.sql
migrations/legacy/0007_email_subscribers.sql
```
