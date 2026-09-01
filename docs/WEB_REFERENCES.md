# External implementation references

Checked during the 2026-08-31 build. Re-check before a long-lived production deployment because platform contracts can change.

## Databricks

- Free Edition limitations: https://docs.databricks.com/aws/en/getting-started/free-edition-limitations
- Databricks Apps authorization: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/auth
- App HTTP forwarded headers: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/http-headers
- App runtime / `app.yaml`: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/app-runtime
- App resources and `valueFrom`: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources
- Bundle resources: https://docs.databricks.com/aws/en/dev-tools/bundles/resources
- SQL Statement Execution API: https://docs.databricks.com/api/statement-execution/v1
- Genie conversation API: https://docs.databricks.com/api/genie/v1/genie-start-conversation
- Genie Agent/Space management API: https://docs.databricks.com/api/genie/v1/space
- Genie Agent creation and `parent_path`: https://docs.databricks.com/aws/en/genie-agents/conversation-api

## UI anti-slop reference

- Impeccable slop catalog: https://impeccable.style/slop/

The interface contract in `DESIGN.md` translates the relevant anti-patterns into project-specific constraints rather than blindly copying a style.
