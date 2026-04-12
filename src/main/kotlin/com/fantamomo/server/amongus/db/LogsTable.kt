package com.fantamomo.server.amongus.db

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.CurrentDateTime
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

object LogsTable : Table("logs") {
    val id = varchar("id", length = 8)
    val createdAt = datetime("created_at")
        .defaultExpression(CurrentDateTime)
    val fileSize = long("file_size")

    override val primaryKey = PrimaryKey(id)
}