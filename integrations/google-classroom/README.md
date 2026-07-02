# Google Classroom Integration

Google Classroom support is implemented as a Classroom add-on backed by hosted HTTPS iframe routes. The SDK does not call Google APIs directly; the host app owns OAuth, Classroom API calls, attachment creation, submission state, and grade passback.

Use `klein-sdk/integrations/google-classroom` for:

- generating add-on iframe URLs;
- keeping Classroom launch state normalized;
- documenting the expected hosted routes.

Recommended routes:

```txt
/integrations/google-classroom/attachment-discovery
/integrations/google-classroom/teacher-view
/integrations/google-classroom/student-view
/integrations/google-classroom/student-work-review
/integrations/google-classroom/link-upgrade
```

Required host work:

- configure these URLs in Google Cloud / Workspace Marketplace for the Classroom add-on;
- exchange and validate Classroom add-on tokens in the host backend;
- create and persist attachments that point back to SDK activity URLs;
- load student work snapshots in the student and review views;
- implement grade passback outside the SDK core when needed.

Official reference: https://developers.google.com/workspace/classroom/add-ons
