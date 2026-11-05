# Database Schema

## Technology
- **ORM:** Prisma 7.8
- **Database:** PostgreSQL (prisma.io hosting)
- **Client generated to:** `src/generated/prisma/`

## Current Models

### Task
```prisma
model Task {
  id          String    @id @default(cuid())
  title       String
  category    String                    // google-ads-repair, google-ads-shopping, google-merchant, website, blog
  status      String    @default("todo") // todo, in_progress, done
  date        String                    // YYYY-MM-DD format
  createdAt   DateTime  @default(now())
  completedAt DateTime?
  timeLogs    TimeLog[]
}
```

### TimeLog
```prisma
model TimeLog {
  id       String   @id @default(cuid())
  taskId   String
  task     Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  start    DateTime
  end      DateTime?
  duration Int?     // milliseconds
}
```

### Session
```prisma
model Session {
  id        String    @id @default(cuid())
  start     DateTime
  end       DateTime?
  createdAt DateTime  @default(now())
}
```

### BlogIdea
```prisma
model BlogIdea {
  id             String   @id @default(cuid())
  title          String
  description    String
  targetKeywords String[]
  createdAt      DateTime @default(now())
}
```

### AuditIssue
```prisma
model AuditIssue {
  id          String  @id @default(cuid())
  itemId      Int
  itemType    String  // product, post, page
  itemTitle   String
  severity    String  // high, medium, low
  category    String  // missing_meta, short_content, bad_title, no_image, seo_opportunity
  description String
  suggestion  String
}
```

### AuditScan
```prisma
model AuditScan {
  id           String   @id @default(cuid())
  scannedAt    DateTime @default(now())
  productCount Int      @default(0)
  postCount    Int      @default(0)
  pageCount    Int      @default(0)
  totalIssues  Int      @default(0)
  highCount    Int      @default(0)
  mediumCount  Int      @default(0)
  lowCount     Int      @default(0)
}
```

## Planned Additions (Phase 1-8)

### Users & Auth
```prisma
model User {
  id           String   @id @default(uuid())
  name         String
  username     String   @unique
  email        String   @unique
  passwordHash String
  role         String   @default("viewer")
  status       String   @default("active")  // active, disabled
  avatarUrl    String?
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  createdBy    String?
  updatedAt    DateTime @updatedAt
}
```

### Analytics
```prisma
model AnalyticsEvent {
  id           String   @id @default(uuid())
  eventName    String
  sessionId    String
  visitorId    String
  occurredAt   DateTime
  properties   Json
}
```

Full analytics schema documented in `/docs/analytics-events.md`.
