package com.fantamomo.server.amongus

import com.fantamomo.server.amongus.db.LogService
import com.fantamomo.server.amongus.model.LogReferenceData
import com.fantamomo.server.amongus.model.LogState
import kotlinx.coroutines.*
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToStream
import org.jetbrains.exposed.sql.Database
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import java.nio.file.Path
import java.security.SecureRandom
import kotlin.io.path.*
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.measureTimedValue

class LogManager(db: Database, val scope: CoroutineScope) {

    private val service = LogService(db)

    private val json = Json {
        ignoreUnknownKeys = true
    }

    suspend fun initialize() {
        val all = service.getAllLogs()

        for (log in all) {
            if (ServerConstants.logsDir.resolve("${log.id}.json").notExists()) {
                logger.warn("Log file for id ${log.id} does not exist, removing from database")
                service.remove(log.id)
            }
        }
        for (file in ServerConstants.logsDir.listDirectoryEntries("*.json")) {
            val id = file.nameWithoutExtension
            if (id.length != 8) continue
            if (all.none { it.id == id }) {
                logger.warn("Log file for id $id does not exist in database, removing")
                file.deleteExisting()
            }
        }

        val count = removeOldLogs()
        logger.info("Removed $count expired logs.")
    }

    @OptIn(ExperimentalSerializationApi::class)
    suspend fun createLog(log: JsonObject): String {
        var id: String
        var file: Path

        do {
            val array = ByteArray(4)
            SecureRandom().nextBytes(array)
            id = array.toHexString().padStart(8, '0')

            file = ServerConstants.logsDir.resolve("$id.json")
            if (file.notExists()) break
        } while (true)

        val size = withContext(Dispatchers.IO) {
            try {
                val stream = file.outputStream()
                json.encodeToStream(log, stream)
                file.fileSize()
            } catch (e: Exception) {
                logger.error("Failed to write log to file", e)
                throw IllegalStateException("Failed to write log to file", e)
            }
        }

        val log = service.createLog(id, size, ServerConfig.SAVE_LOG_DURATION)
        if (log.id != id) {
            logger.error("Log ID mismatch after creation: expected $id, got ${log.id}")
            throw IllegalStateException("Log ID mismatch after creation")
        }
        return log.id
    }

    suspend fun cleanupJob() = coroutineScope {
        while (isActive) {
            delay(5.minutes)
            val (removed, time) = measureTimedValue {
                removeOldLogs()
            }
            if (removed > 0) {
                logger.info("Removed $removed expired logs in ${time.inWholeMilliseconds}ms")
            }
        }
    }

    private suspend fun removeOldLogs(): Int {
        val logs = service.getAllLogs()

        val now = Clock.System.now()
        val toRemove = logs.mapNotNull { if (it.isExpired(now)) it.id else null }

        if (toRemove.isEmpty()) return 0

        service.removeAll(toRemove)
        for (id in toRemove) {
            val file = ServerConstants.logsDir.resolve("$id.json")
            try {
                if (file.exists()) {
                    file.deleteExisting()
                    logger.info("Deleted log file for id: $id")
                }
            } catch (e: Exception) {
                logger.error("Failed to delete log file for id: $id", e)
            }
        }

        return toRemove.size
    }

    suspend fun getLog(id: String) = service.getLog(id)

    suspend fun getLogs(repo: String, id: Int, type: String) = service.getLogs(repo, id, type)

    suspend fun addLink(log: String, externalRepo: String, externalId: Int, externalType: String): Boolean {
        val log = getLog(log) ?: return false
        service.addLink(log.id, externalRepo, externalId, externalType)
        service.updateState(log.id, if (log.lifecycle.state != LogState.TEMPORARY) log.lifecycle.state else LogState.LINKED)
        return true
    }

    suspend fun removeLinks(externalRepo: String, externalId: Int, externalType: String) {
        service.removeLinks(externalRepo, externalId, externalType)
    }

    suspend fun linkClosed(repo: String, id: Int, type: String) {
        service.updateRefState(repo, id, type, LogReferenceData.LogReferenceState.CLOSED)
        val logs = getLogs(repo, id, type)
        for (log in logs) {
            val refs = log.references
            if (refs.all { it.state == LogReferenceData.LogReferenceState.CLOSED }) {
                service.updateState(log.id, LogState.ARCHIVED)
            }
        }
    }

    suspend fun linkReopend(repo: String, id: Int, type: String) {
        service.updateRefState(repo, id, type, LogReferenceData.LogReferenceState.OPEN)
        val logs = getLogs(repo, id, type)
        for (log in logs) {
            val refs = log.references
            if (refs.any { it.state == LogReferenceData.LogReferenceState.OPEN }) {
                service.updateState(log.id, LogState.LINKED)
            }
        }
    }

    companion object {
        val logger: Logger = LoggerFactory.getLogger("LogManager")
    }
}