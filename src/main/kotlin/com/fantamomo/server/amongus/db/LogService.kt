package com.fantamomo.server.amongus.db

import com.fantamomo.server.amongus.model.Log
import com.fantamomo.server.amongus.model.LogLifecycleData
import com.fantamomo.server.amongus.model.LogReferenceData
import com.fantamomo.server.amongus.model.LogState
import kotlinx.coroutines.Dispatchers
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.ExperimentalSerializationApi
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.experimental.newSuspendedTransaction
import org.jetbrains.exposed.sql.transactions.transaction
import kotlin.time.Clock.System
import kotlin.time.Duration.Companion.hours

class LogService(database: Database) {

    init {
        transaction(database) {
            SchemaUtils.create(LogsTable, LogsLifecycleTable, LogsReferencesTable)
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    suspend fun createLog(id: String, fileSize: Long): Log {
        dbQuery {
            val instant = System.now()
            val now = instant.toLocalDateTime(TimeZone.UTC)

            LogsTable.insert {
                it[LogsTable.id] = id
                it[LogsTable.fileSize] = fileSize
                it[LogsTable.createdAt] = now
            }

            LogsLifecycleTable.insert {
                it[LogsLifecycleTable.state] = LogState.TEMPORARY
                it[LogsLifecycleTable.logId] = id
                it[LogsLifecycleTable.expiresAt] = (instant + 2.hours).toLocalDateTime(TimeZone.UTC)
            }
        }

        return getLog(id) ?: throw IllegalStateException("Failed to create log with id: $id")
    }

    suspend fun getLog(id: String): Log? = dbQuery {
        val logRow = LogsTable.selectAll().where { LogsTable.id eq id }.singleOrNull() ?: return@dbQuery null
        val lifecycleRow = LogsLifecycleTable.selectAll().where { LogsLifecycleTable.logId eq id }.first()
        val referenceRow = LogsReferencesTable.selectAll().where { LogsReferencesTable.logId eq id }

        Log(
            id = id,
            createdAt = logRow[LogsTable.createdAt].toInstant(TimeZone.UTC),
            fileSize = logRow[LogsTable.fileSize],
            lifecycle = LogLifecycleData(
                state = lifecycleRow[LogsLifecycleTable.state],
                expiresAt = lifecycleRow[LogsLifecycleTable.expiresAt].toInstant(TimeZone.UTC),
                updatedAt = lifecycleRow[LogsLifecycleTable.updatedAt].toInstant(TimeZone.UTC)
            ),
            references = referenceRow.map {
                LogReferenceData(
                    externalType = it[LogsReferencesTable.externalType],
                    externalId = it[LogsReferencesTable.externalId],
                    externalRepo = it[LogsReferencesTable.externalRepo],
                )
            }
        )
    }

    suspend fun getAllLogs(): List<Log> = dbQuery {
        val logRow = LogsTable.selectAll().toList()
        val lifecycleRow = LogsLifecycleTable.selectAll().toList()
        val referenceRow = LogsReferencesTable.selectAll().toList()

        logRow.map { log ->
            Log(
                id = log[LogsTable.id],
                createdAt = log[LogsTable.createdAt].toInstant(TimeZone.UTC),
                fileSize = log[LogsTable.fileSize],
                lifecycle = lifecycleRow.first { it[LogsLifecycleTable.logId] == log[LogsTable.id] }.let {
                    LogLifecycleData(
                        state = it[LogsLifecycleTable.state],
                        expiresAt = it[LogsLifecycleTable.expiresAt].toInstant(TimeZone.UTC),
                        updatedAt = it[LogsLifecycleTable.updatedAt].toInstant(TimeZone.UTC)
                    )
                },
                references = referenceRow.filter { it[LogsReferencesTable.logId] == log[LogsReferencesTable.logId] }.map {
                    LogReferenceData(
                        externalType = it[LogsReferencesTable.externalType],
                        externalId = it[LogsReferencesTable.externalId],
                        externalRepo = it[LogsReferencesTable.externalRepo],
                    )
                }
            )
        }
    }

    private suspend fun <T> dbQuery(block: suspend () -> T): T =
        newSuspendedTransaction(Dispatchers.IO) { block() }

    suspend fun remove(id: String) = dbQuery {
        LogsTable.deleteWhere { LogsTable.id eq id }
        LogsLifecycleTable.deleteWhere { LogsLifecycleTable.logId eq id }
        LogsReferencesTable.deleteWhere { LogsReferencesTable.logId eq id }
    }

    suspend fun removeAll(toRemove: List<String>) = dbQuery {
        toRemove.forEach { id ->
            LogsTable.deleteWhere { LogsTable.id eq id }
            LogsLifecycleTable.deleteWhere { LogsLifecycleTable.logId eq id }
            LogsReferencesTable.deleteWhere { LogsReferencesTable.logId eq id }
        }
    }

    suspend fun addLink(id: String, externalRepo: String, externalId: Int, externalType: String) = dbQuery {
        LogsReferencesTable.insert {
            it[LogsReferencesTable.logId] = id
            it[LogsReferencesTable.externalRepo] = externalRepo
            it[LogsReferencesTable.externalId] = externalId
            it[LogsReferencesTable.externalType] = externalType
        }
    }

    suspend fun updateState(id: String, state: LogState) = dbQuery {
        LogsLifecycleTable.update({ LogsLifecycleTable.logId eq id }) {
            it[LogsLifecycleTable.state] = state
            it[LogsLifecycleTable.updatedAt] = System.now().toLocalDateTime(TimeZone.UTC)
        }
    }
}

