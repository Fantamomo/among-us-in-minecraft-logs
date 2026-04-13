package com.fantamomo.server.amongus.db

import com.fantamomo.server.amongus.model.LogReferenceData
import org.jetbrains.exposed.sql.Table

object LogsReferencesTable : Table("log_references") {
    val id = integer("id").autoIncrement()

    val logId = varchar("log_id", 8)
        .references(LogsTable.id)

    val externalType = varchar("external_type", 10) // pr, issue
    val externalId = integer("external_in") // pr number, issue number
    val externalRepo = varchar("external_repo", 100) // GitHub repo name, e.g., Fantamomo/among-us-in-minecraft
    val state = enumeration("state", LogReferenceData.LogReferenceState::class)

    override val primaryKey = PrimaryKey(id)
}