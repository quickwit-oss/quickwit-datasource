# Changelog

## 0.5.0

### What's Changed

- Fixed adhoc filters feature for Grafana 11.x

## 0.3.0-beta.1

This version works only with quickwit main version (or docker edge).

- Add support for data links (possibility to create links to other datasources).

## 0.3.0-beta.0

This version works only with quickwit main version (or docker edge).

- Add support for log context feature.
- Better error handling.

## 0.2.4

### What's Changed

- Pluing is now signed

## 0.2.3

### Fixed

- Add licensing and notice files to respect Grafana Labs license
- Various cleanup: remove console.log, dependency on Grafana simplejson
- Update src/README.md

## 0.2.2

### Fixed

- Fix bug on template variable depending on another template variable
- Fix bug when template variable is used with multiple values

## 0.2.1

### What's Changed
* Add support for template variables
* Update provisioning datasource guide by @hoangphuocbk in https://github.com/quickwit-oss/quickwit-datasource/pull/13

### New Contributors
* @hoangphuocbk made their first contribution in https://github.com/quickwit-oss/quickwit-datasource/pull/13

## 0.2.0

### Added
- Add HTTP Basic Auth support
- Clean the datasource parameters stored in the database (breaking change).

### Fixed
- Sub aggregations were broken when a sub bucket was empty. This can happen if some document have missing values on the sub field.

## 0.1.0

Initial release.

### Added

- Support Explore with volume an logs panels
- Support for Dashboard
- Support for Alerts
- Metrics supported: `'count', 'avg', 'sum', 'min', 'max', 'percentiles', 'raw_data', 'logs'`.
