# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-06-16

### Changed
- Improved model catalog command display with richer metadata columns and aligned model registration output.
- Enhanced enrichment merger to handle additional model metadata fields and fallback defaults.

## [0.2.0] - 2026-06-01

### Added
- Added cache replacement retries for transient file access failures.
- Added cache-only startup support, scheduled bootstrap/deferred background refresh behavior, and stale-cache handling for reasoning metadata gaps.
- Added enrichment metadata for OpenAI reasoning compatibility and Huashang free model coverage.

### Changed
- Read hidden-provider configuration directly from static config instead of dynamically importing multi-auth.
- Widened Pi peer dependency compatibility to include Pi 0.77.x and 0.78.x.

## [0.1.0] - 2026-05-27

### Added
- Prepared `pi-model-discovery` package metadata, README, changelog, license, package ignore rules, and local-extension git readiness for public release review.
- Added dynamic provider model discovery, metadata enrichment, cache-first registration, and `/pi-model-discovery` catalog command support.
- Added file-gated debug logging under the extension-local `debug/` directory when `config.json` sets `debug` to `true`.
