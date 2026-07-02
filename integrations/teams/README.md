# Microsoft Teams Integration

Teams support is implemented as a hosted web app embedded in Teams tabs. The SDK does not import the Teams JavaScript SDK directly; the host app should do that in the Teams-specific routes and pass a normalized launch context into `klein-sdk`.

Use `klein-sdk/integrations/teams` for:

- generating Teams tab launch URLs;
- generating a manifest template;
- keeping Teams-specific context separate from the instrument engines.

Recommended routes:

```txt
/integrations/teams/personal
/integrations/teams/config
/integrations/teams/tab
```

Required host work:

- replace placeholder app id, host URLs, developer URLs, and icons in `manifest.template.json`;
- implement Teams SSO/OAuth in the host app if user identity is required;
- save selected tool/room configuration from the configurable tab route;
- make `validDomains` match the deployed HTTPS host.

Official reference: https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/what-are-tabs
