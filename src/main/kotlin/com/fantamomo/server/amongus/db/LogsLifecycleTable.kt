package com.fantamomo.server.amongus.db

import com.fantamomo.server.amongus.model.LogState
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.CurrentDateTime
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

object LogsLifecycleTable : Table("log_lifecycle") {
    val logId = varchar("log_id", length = 8)
        .references(LogsTable.id)
    val state = enumerationByName<LogState>("state", 10)

    val expiresAt = datetime("expires_at")

    val updatedAt = datetime("updated_at")
        .defaultExpression(CurrentDateTime)

    override val primaryKey = PrimaryKey(logId)
}