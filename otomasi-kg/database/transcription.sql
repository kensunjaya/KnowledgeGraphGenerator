-- Run against the Transcription database only.
IF DB_NAME() <> N'Transcription' THROW 50000, 'Select the Transcription database first.', 1;
IF OBJECT_ID(N'dbo.TranscriptionRequest', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TranscriptionRequest (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        filename NVARCHAR(255) NOT NULL,
        fileSize BIGINT NOT NULL,
        language VARCHAR(10) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
        markdown NVARCHAR(MAX) NULL,
        errorMessage NVARCHAR(2000) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        startedAt DATETIME2 NULL,
        completedAt DATETIME2 NULL,
        heartbeatAt DATETIME2 NULL,
        runToken UNIQUEIDENTIFIER NULL,
        CHECK (fileSize > 0),
        CHECK (status <> 'COMPLETED' OR markdown IS NOT NULL)
    );
    CREATE INDEX IX_TranscriptionRequest_createdAt ON dbo.TranscriptionRequest(createdAt DESC);
    -- Enforce a single model process, even across concurrent HTTP requests.
    CREATE UNIQUE INDEX UX_TranscriptionRequest_processing ON dbo.TranscriptionRequest(status)
        WHERE status = 'PROCESSING';
END;
