# Client Method Coverage (Maintainers)

Source: [`src/client.js`](../../src/client.js) and [`admin-functions.js`](https://github.com/64pixeldreams/headsuppapp/blob/main/apps/headsupp-api/src/functions/admin-functions.js).

| Client method | Admin action | Primary doc |
|---------------|--------------|-------------|
| `bootstrapServiceApiKey` | `operator.bootstrapServiceApiKey` | [getting-started.md](../getting-started.md) |
| `createWorkspace` | `admin.createWorkspace` | getting-started, [client-reference.md](../client-reference.md) |
| `createChannel` | `admin.createChannel` | getting-started, client-reference |
| `getChannel` | `admin.getChannel` | client-reference |
| `updateChannel` | `admin.updateChannel` | client-reference |
| `createChannelContract` | `admin.createChannelContract` | [cookbook/channel-contracts.md](../cookbook/channel-contracts.md) |
| `updateChannelContract` | `admin.updateChannelContract` | cookbook/channel-contracts |
| `createConnector` | `admin.createConnector` | getting-started |
| `createSignal` | `admin.createSignal` | getting-started |
| `createWatch` | `admin.createWatch` | getting-started, [concepts/watch-types.md](../concepts/watch-types.md) |
| `createSubscriber` | `admin.createSubscriber` | cookbooks |
| `disableSubscriber` | `admin.disableSubscriber` | [cookbook/subscriber-lifecycle.md](../cookbook/subscriber-lifecycle.md) |
| `disableSubscriberByEmail` | `admin.disableSubscriber` | cookbook/subscriber-lifecycle |
| `deleteSubscriber` | `admin.deleteSubscriber` | cookbook/subscriber-lifecycle |
| `listChannelAlerts` | `admin.listChannelAlerts` | getting-started |
| `getWatchState` | `admin.getWatchState` | getting-started, [cookbook/noise-control.md](../cookbook/noise-control.md) |
| `snoozeWatch` | `admin.snoozeWatch` | cookbook/noise-control |
| `muteWatch` | `admin.muteWatch` | cookbook/noise-control |
| `resumeWatch` | `admin.resumeWatch` | cookbook/noise-control |
| `ignoreAlert` | `admin.ignoreAlert` | cookbook/noise-control |
| `sendEvent` | `POST /v1/events/{connectorKey}` | getting-started |
| `sendEvents` | batch ingest | client-reference |
| `signEventPayload` | HMAC helper | client-reference |
| `requestFunction` | any registered action | client-reference (escape hatch) |

Actions without named wrappers (use `requestFunction`):

- `admin.getChannelContract`
- `admin.listChannelContractVersions`
- `admin.listAlertTimeline`
