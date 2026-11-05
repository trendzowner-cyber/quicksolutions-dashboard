# Permissions & RBAC

## Current State
- **Admin:** Full access (DASHBOARD_PASSWORD)
- **Client:** View-only access (CLIENT_PASSWORD)
- Permissions are NOT modular — hard-coded role check in tasks API only
- No individual user accounts

## Planned Roles

### Owner
- Highest permission level
- Cannot be deleted, demoted, or impersonated by others
- Can transfer ownership through explicit flow

### Admin
- Full dashboard access
- Manage users, integrations, settings
- Cannot demote/delete Owner

### Marketer
- Marketing features (campaigns, coupons, UTMs)
- View analytics
- Create/edit blog content

### Content Manager
- Blog creation, editing, publishing
- SEO tools
- View content analytics
- Cannot manage users or integrations

### Sales / Operations
- View orders, products, customers
- Manage coupons
- View sales analytics

### Analyst
- Read-only analytics access
- Export reports
- No write permissions

### Viewer
- Minimal read-only access
- Basic dashboard overview

## Planned Permission Modules
```
dashboard.view
analytics.view, analytics.export
sales.view, sales.manage
orders.view, orders.manage
products.view, products.manage
customers.view
marketing.view, marketing.manage
coupons.create, coupons.edit
content.view, content.create, content.edit, content.publish, content.delete
tasks.view, tasks.create, tasks.edit, tasks.delete, tasks.assign
users.view, users.create, users.edit, users.disable
settings.view, settings.manage
integrations.manage
audit.view
```

## Enforcement
- All permissions enforced server-side in API routes
- Middleware checks authentication
- Individual route handlers check authorization
- Hiding UI buttons is UX, not security
