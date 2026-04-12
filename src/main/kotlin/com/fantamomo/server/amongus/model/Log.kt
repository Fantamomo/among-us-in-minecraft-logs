package com.fantamomo.server.amongus.model

import com.fantamomo.server.amongus.ServerConstants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.io.path.notExists
import kotlin.io.path.readText
import kotlin.time.Clock
import kotlin.time.Instant

data class Log(
    val id: String,
    val createdAt: Instant,
    val fileSize: Long?,
    val lifecycle: LogLifecycleData,
    val references: List<LogReferenceData>
) {
    suspend fun readLog(): JsonObject = withContext(Dispatchers.IO) {
        val path = ServerConstants.logsDir.resolve("$id.json")
        if (path.notExists()) {
            throw IllegalStateException("Log file not found for id: $id")
        }
        Json.parseToJsonElement(path.readText()).jsonObject
    }

    fun isExpired(time: Instant = Clock.System.now()): Boolean = lifecycle.state == LogState.TEMPORARY && lifecycle.expiresAt < time
}