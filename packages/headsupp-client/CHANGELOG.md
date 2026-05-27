# Changelog

## 0.1.2

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
