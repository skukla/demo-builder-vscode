# Modify Content

Use this skill to edit page content in DA.live.

## DA.live overview

DA.live is the content authoring interface for EDS pages. Pages are stored as
Word-compatible `.da` documents and compiled to HTML by Helix.

## Tools

Use the `da-live` MCP server (if configured) for programmatic content operations:

| Tool | Purpose |
|---|---|
| `list_pages` | List pages in an org/site |
| `get_page` | Read page content |
| `update_page` | Write updated content to a page |

## Manual workflow

1. Open DA.live at `https://da.live/#/{daLiveOrg}/{daLiveSite}`.
2. Navigate to the page.
3. Edit the content directly in the authoring view.
4. DA.live saves and triggers a Helix preview automatically.
5. For live publish, use the "Publish" button or call `sync_content`.

## Programmatic workflow

```
> da-live::update_page org="{daLiveOrg}" site="{daLiveSite}" path="/page" content="..."
> sync_content path="/page"
```

## Notes

- Pages are stored as tables in DA.live — each block is a table row.
- Use `sync_content` to explicitly publish a page to the live URL.
- Unpublishing removes the page from the live URL but keeps it in DA.live.
