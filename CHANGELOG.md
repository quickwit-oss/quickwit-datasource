# Changelog

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
