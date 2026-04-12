package com.fantamomo.server.amongus

import com.fantamomo.server.amongus.app.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory

fun main(): Unit = runBlocking {

    @Suppress("UnusedExpression")
    ServerConfig

    val logger = LoggerFactory.getLogger("Main")

    logger.info("Starting Among Us Log Server...")

    coroutineScope {
        val manager = LogManager(getDatabases(), this)

        manager.initialize()

        launch {
            val server = embeddedServer(Netty, port = 8080, host = "0.0.0.0") { module(manager) }
            server.startSuspend(wait = true)
        }

        launch {
            manager.cleanupJob()
        }
    }
}

fun Application.module(manager: LogManager) {
    configureHTTP()
    configureSecurity()
    configureMonitoring()
    configureSerialization()
    configureAdministration()
    configureRouting(manager)
}
