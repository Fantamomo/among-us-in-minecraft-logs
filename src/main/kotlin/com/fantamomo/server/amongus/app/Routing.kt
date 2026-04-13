package com.fantamomo.server.amongus.app

import com.fantamomo.server.amongus.LogManager
import com.fantamomo.server.amongus.ServerConstants
import com.fantamomo.server.amongus.model.LogState
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.http.content.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.*

fun Application.configureRouting(manager: LogManager) {
    routing {
        staticResources("/asserts", "asserts")
        get("/") {
            val html = ServerConstants::class.java.getResourceAsStream("/asserts/index.html")?.reader()?.readText()
            if (html == null) {
                call.respond(HttpStatusCode.NotFound)
                return@get
            }
            call.respondText(html, ContentType.Text.Html)
        }
        get("/raw/{id}") {
            val id = call.parameters["id"] ?: throw IllegalArgumentException("Invalid ID")
            val log = manager.getLog(id)
            call.response.headers.append("AUIML", id)
            if (log != null && !log.isExpired() && log.lifecycle.state != LogState.ARCHIVED) {
                call.respond(HttpStatusCode.OK, log.readLog())
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }
        get("/log/{id}") {
            val id = call.parameters["id"] ?: throw IllegalArgumentException("Invalid ID")
            val html = ServerConstants::class.java.getResourceAsStream("/asserts/log.html")?.reader()?.readText()
            if (html == null) {
                call.respond(HttpStatusCode.NotFound)
                return@get
            }
            val injected = html.replace(
                "window.__LOG_CODE__",
                "window.__LOG_CODE__ = \"${id.replace("\"", "")}\""
            )
            call.respondText(injected, ContentType.Text.Html)
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
                route("/link") {
                    post {
                        val request = call.receive<JsonObject>()
                        val logs = request["logs"]?.jsonArray?.map { it.jsonPrimitive.content } ?: throw IllegalArgumentException("Invalid ID")
                        if (logs.isEmpty()) {
                            call.respond(HttpStatusCode.BadRequest)
                        }
                        val externalRepo = request["repo"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid repo")
                        val externalId = request["id"]?.jsonPrimitive?.intOrNull ?: throw IllegalArgumentException("Invalid external ID")
                        val externalType = request["type"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid external type")
                        manager.removeLinks(externalRepo, externalId, externalType)
                        var success = false
                        for (log in logs) {
                            success = manager.addLink(log, externalRepo, externalId, externalType) || success
                        }
                        if (success) {
                            call.respond(HttpStatusCode.OK)
                        } else {
                            call.respond(HttpStatusCode.NotFound)
                        }
                    }
                    post("/close") {
                        val request = call.receive<JsonObject>()
                        val repo = request["repo"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid repo")
                        val id = request["id"]?.jsonPrimitive?.intOrNull ?: throw IllegalArgumentException("Invalid external ID")
                        val type = request["type"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid type")
                        manager.linkClosed(repo, id, type)
                        call.respond(HttpStatusCode.OK)
                    }
                    post("/reopen") {
                        val request = call.receive<JsonObject>()
                        val repo = request["repo"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid repo")
                        val id = request["id"]?.jsonPrimitive?.intOrNull ?: throw IllegalArgumentException("Invalid external ID")
                        val type = request["type"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("Invalid type")
                        manager.linkReopend(repo, id, type)
                        call.respond(HttpStatusCode.OK)
                    }
                }
            }
        }
    }
}
