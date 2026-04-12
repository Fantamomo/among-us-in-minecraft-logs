package com.fantamomo.server.amongus.model

import kotlin.time.Instant

data class LogLifecycleData(
    val state: LogState,
    val expiresAt: Instant,
    val updatedAt: Instant?
)