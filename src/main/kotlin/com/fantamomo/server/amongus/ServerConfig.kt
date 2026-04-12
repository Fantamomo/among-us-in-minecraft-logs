package com.fantamomo.server.amongus

import org.slf4j.LoggerFactory
import java.security.SecureRandom
import java.util.*
import kotlin.io.path.createFile
import kotlin.io.path.notExists
import kotlin.io.path.reader
import kotlin.io.path.writer

object ServerConfig {
    private val logger = LoggerFactory.getLogger("ServerConfig")

    val PORT: Int
    val HOST: String
    val GITHUB_ACTION_KEY: String

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
        } catch (e: Exception) {
            logger.error("Invalid configuration values", e)
            throw e
        }
    }

    private fun Properties.defaultProperties() {
        setProperty("PORT", "8080")
        setProperty("HOST", "0.0.0.0")
        setProperty("GITHUB_ACTION_KEY", "sk_auiml_"+ByteArray(16).also { SecureRandom().nextBytes(it) }.toHexString())
    }
}