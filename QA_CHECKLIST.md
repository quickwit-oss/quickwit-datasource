# QA Checklist — Quickwit Grafana Datasource Plugin

## Plugin-owned UI areas

### Config Editor (`/connections/datasources/edit/<uid>`)

- [ ] **Index settings section**
  - [ ] Index ID field accepts input and saves
  - [ ] Message field name field accepts input and saves
  - [ ] Log level field accepts input and saves
- [ ] **Editor settings section**
  - [ ] Default logs limit field accepts input and saves
- [ ] **Data links section**
  - [ ] Can add a data link
  - [ ] Can remove a data link
- [ ] **Save & test** validates connection to Quickwit and reports success/failure

### Query Editor — Explore view (`/explore`)

- [ ] **Query type tabs**
  - [ ] Metrics tab loads metric aggregation options
  - [ ] Logs tab loads log query options
  - [ ] Raw Data tab loads raw query options
- [ ] **Lucene Query input**
  - [ ] Can type a query
  - [ ] Autocomplete works (Ctrl+Space)
  - [ ] Shift+Enter runs the query
- [ ] **Logs config row**
  - [ ] Tail count is configurable
  - [ ] Sort direction is configurable
- [ ] **Results**
  - [ ] Logs volume histogram renders with data
  - [ ] Log rows render in the Logs panel
  - [ ] Table view toggle works
  - [ ] "Scan for older logs" button works

### Query Editor — Dashboard panels

- [ ] **Metrics query type**
  - [ ] Date histogram aggregation works
  - [ ] Terms aggregation works
  - [ ] Metric aggregations (avg, sum, count, etc.) work
- [ ] **Logs query type** renders logs in panel
- [ ] **Ad-hoc filters** can be added and filter results dynamically

## Not owned by the plugin (Grafana built-in)

These are rendered by Grafana itself and do not need plugin-level QA:

- Sidebar navigation
- Time picker
- Log row rendering / expansion
- Chart rendering (histogram, time series)
- Search bar, breadcrumbs, header
- Auth section in config (Basic auth, TLS, OAuth)
- HTTP section in config (URL, Allowed cookies, Timeout)
