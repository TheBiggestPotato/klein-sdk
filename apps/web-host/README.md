# Web Host App

This folder is reserved for the hosted HTTPS app that renders `klein-sdk` instruments inside normal web pages, Microsoft Teams tabs, and Google Classroom add-on iframes.

The SDK package stays framework-independent. The host app can be built with any frontend stack, but it should expose these routes:

```txt
/embed

/integrations/teams/personal
/integrations/teams/config
/integrations/teams/tab

/integrations/google-classroom/attachment-discovery
/integrations/google-classroom/teacher-view
/integrations/google-classroom/student-view
/integrations/google-classroom/student-work-review
/integrations/google-classroom/link-upgrade
```

Minimum host responsibilities:

- authenticate users with the platform-specific SSO/OAuth flow;
- load and save SDK snapshots;
- provide collaboration transport when a live room is needed;
- pass a validated launch context into the SDK;
- enforce CSP, frame ancestors, CORS, and cookie/session rules for iframe surfaces;
- provide assignment/grade passback endpoints outside the SDK core.

The host app should use `klein-sdk/embed` to parse launch URLs and `klein-sdk/integrations/*` to generate platform URLs and manifests.
