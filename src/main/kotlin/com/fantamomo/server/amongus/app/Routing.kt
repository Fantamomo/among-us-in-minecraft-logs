package com.fantamomo.server.amongus.app

import com.fantamomo.server.amongus.LogManager
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.JsonObject

fun Application.configureRouting(manager: LogManager) {
    routing {
        get("/") {
            call.respondText("Hello World!")
        }
        get("/raw/{id}") {
            val id = call.parameters["id"] ?: throw IllegalArgumentException("Invalid ID")
            val log = manager.getLog(id)
            if (log != null && !log.isExpired()) {
                call.respond(HttpStatusCode.OK, log.readLog())
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }
        rateLimit {
            post("/upload") {
                val log = call.receive<JsonObject>()
                val id = manager.createLog(log)
                call.respond(HttpStatusCode.Created, id)
            }
        }
        authenticate {
            route("/admin") {
                get("/link") {
                    val log = call.parameters["log"] ?: throw IllegalArgumentException("Invalid ID")
                    val externalRepo = call.parameters["repo"] ?: throw IllegalArgumentException("Invalid repo")
                    val externalId = call.parameters["id"]?.toIntOrNull() ?: throw IllegalArgumentException("Invalid external ID")
                    val externalType = call.parameters["type"] ?: throw IllegalArgumentException("Invalid external type")
                    if (manager.addLink(log, externalRepo, externalId, externalType)) {
                        call.respond(HttpStatusCode.OK)
                    } else {
                        call.respond(HttpStatusCode.NotFound)
                    }
                }
            }
        }
    }
}
