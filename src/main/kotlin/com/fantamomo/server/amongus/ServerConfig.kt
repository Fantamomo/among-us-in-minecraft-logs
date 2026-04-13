package com.fantamomo.server.amongus

import org.slf4j.LoggerFactory
import java.security.SecureRandom
import java.util.*
import kotlin.io.path.createFile
import kotlin.io.path.notExists
import kotlin.io.path.reader
import kotlin.io.path.writer
import kotlin.time.Duration

object ServerConfig {
    private val logger = LoggerFactory.getLogger("ServerConfig")

    val PORT: Int
    val HOST: String
    val GITHUB_ACTION_KEY: String
    val SAVE_LOG_DURATION: Duration

    init {
        val file = ServerConstants.configFile

        val properties = Properties()

        properties.defaultProperties()
        try {
            if (file.notExists()) {
                file.createFile()
                properties.store(file.writer(), "Server configuration")
            } else {
                properties.load(file.reader())
            }
        } catch (e: Exception) {
            logger.error("Failed to load config.properties, using default values", e)
        }
        try {
            PORT = properties.getProperty("PORT").toInt()
            HOST = properties.getProperty("HOST")
            GITHUB_ACTION_KEY = properties.getProperty("GITHUB_ACTION_KEY")
            SAVE_LOG_DURATION = Duration.parse(properties.getProperty("SAVE_LOG_DURATION"))
        } catch (e: Exception) {
            logger.error("Invalid configuration values", e)
            throw e
        }
    }

    private fun Properties.defaultProperties() {
        setProperty("PORT", "8080")
        setProperty("HOST", "0.0.0.0")
        setProperty("GITHUB_ACTION_KEY", "sk_auiml_"+ByteArray(16).also { SecureRandom().nextBytes(it) }.toHexString())
        setProperty("SAVE_LOG_DURATION", "24h")
    }
}