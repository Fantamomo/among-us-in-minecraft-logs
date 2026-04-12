package com.fantamomo.server.amongus

import java.nio.file.Path
import kotlin.io.path.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.notExists

object ServerConstants {
    val dir: Path = Path(System.getenv()["AUIML_APPLICATION_DIR"].orEmpty().ifBlank { "." }).toAbsolutePath()
    val dbPath: String = "$dir/database.db"
    val logsDir: Path = dir.resolve("logs")
    val configFile: Path = dir.resolve("config.properties")

    init {
        if (dir.notExists()) dir.createDirectories()
        if (logsDir.notExists()) logsDir.createDirectories()
    }
}