package com.fantamomo.server.amongus.app

import com.fantamomo.server.amongus.ServerConstants
import org.jetbrains.exposed.sql.Database

fun getDatabases() = Database.connect(
    url = "jdbc:sqlite:${ServerConstants.dbPath}",
    driver = "org.sqlite.JDBC",
)
