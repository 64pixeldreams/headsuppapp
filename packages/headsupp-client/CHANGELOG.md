# Changelog

## 0.1.2

- Added `traceEvent` for debugging queued ingest events through alert and delivery state.
- Added SaaS integration cookbook guidance for alert-board channel modeling.
- Added subscriber read wrappers:
  - `getSubscriber`
  - `listSubscribers`
- Documented `mode: 'lifecycle'` webhook subscribers for opt-in/opt-out callbacks.
- Updated cookbook and client reference for email authorization status reads.

## 0.1.1

- Added email subscriber lifecycle wrappers:
  - `disableSubscriber`
  - `deleteSubscriber`
  - `disableSubscriberByEmail`
- Added tests for new admin action mapping and payload shapes.
- Updated README examples for email subscriber provisioning and disable/delete flows.
