package com.fantamomo.server.amongus.app

import com.fantamomo.server.amongus.LogManager
import com.fantamomo.server.amongus.ServerConfig
import com.fantamomo.server.amongus.ServerConstants
import com.fantamomo.server.amongus.model.LogState
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.http.content.*
import io.ktor.server.plugins.cachingheaders.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.*
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

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
            val id = getId() ?: return@get
            val log = manager.getLog(id)
            if (log != null && !log.isExpired() && log.lifecycle.state != LogState.ARCHIVED) {
                call.caching = CachingOptions(CacheControl.MaxAge(60, visibility = CacheControl.Visibility.Private))
                call.response.headers.append("auiml-log-code", id)
                call.respond(HttpStatusCode.OK, log.readLog())
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }
        get("/log/local") {
            val html = ServerConstants::class.java.getResourceAsStream("/asserts/log.html")?.reader()?.readText()
            if (html == null) {
                call.respond(HttpStatusCode.InternalServerError)
                return@get
            }
            call.caching = CachingOptions(CacheControl.MaxAge(600, visibility = CacheControl.Visibility.Private))
            call.response.headers.append("auiml-log-code", "local")
            html.replace(
                "window.__LOG_CODE__",
                "window.__LOG_CODE__ = 'local'"
            )
            call.respondText(html, ContentType.Text.Html)
        }
        head("/log/{id}") {
            val id = getId() ?: return@head
            call.caching = CachingOptions(CacheControl.MaxAge(600, visibility = CacheControl.Visibility.Private))
            call.response.headers.append("auiml-log-code", id)
            call.respond(HttpStatusCode.OK)
        }
        get("/log/{id}") {
            val id = getId() ?: return@get
            val html = ServerConstants::class.java.getResourceAsStream("/asserts/log.html")?.reader()?.readText()
            if (html == null) {
                call.respond(HttpStatusCode.InternalServerError)
                return@get
            }
            call.caching = CachingOptions(CacheControl.MaxAge(600, visibility = CacheControl.Visibility.Private))
            call.response.headers.append("auiml-log-code", id)
            call.respondText(html, ContentType.Text.Html)
        }
        rateLimit {
            post("/upload") {
                val log = call.receive<JsonObject>()

                val clientTtl = call.request.queryParameters["ttl"]
                    ?.toIntOrNull()
                    ?.seconds

                val ttl = clientTtl?.takeIf { it in Duration.ZERO..ServerConfig.SAVE_LOG_DURATION }
                    ?: ServerConfig.SAVE_LOG_DURATION

                val id = manager.createLog(log, ttl)
                val jsonObject = JsonObject(
                    mapOf(
                        "id" to JsonPrimitive(id),
                        "ttl" to JsonPrimitive(ttl.inWholeSeconds),
                        "deleteAt" to JsonPrimitive((Clock.System.now() + ttl).toEpochMilliseconds())
                    )
                )
                call.respond(HttpStatusCode.Created, jsonObject)
            }
        }
        authenticate {
            route("/admin") {
                route("/link") {
                    post {
                        val request = call.receive<JsonObject>()
                        val logs = request["logs"]?.jsonArray?.map { it.jsonPrimitive.content }
                            ?: throw IllegalArgumentException("Invalid ID")
                        if (logs.isEmpty()) {
                            call.respond(HttpStatusCode.BadRequest)
                        }
                        val externalRepo = request["repo"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid repo")
                        val externalId = request["id"]?.jsonPrimitive?.intOrNull
                            ?: throw IllegalArgumentException("Invalid external ID")
                        val externalType = request["type"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid external type")
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
                        val repo = request["repo"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid repo")
                        val id = request["id"]?.jsonPrimitive?.intOrNull
                            ?: throw IllegalArgumentException("Invalid external ID")
                        val type = request["type"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid type")
                        manager.linkClosed(repo, id, type)
                        call.respond(HttpStatusCode.OK)
                    }
                    post("/reopen") {
                        val request = call.receive<JsonObject>()
                        val repo = request["repo"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid repo")
                        val id = request["id"]?.jsonPrimitive?.intOrNull
                            ?: throw IllegalArgumentException("Invalid external ID")
                        val type = request["type"]?.jsonPrimitive?.contentOrNull
                            ?: throw IllegalArgumentException("Invalid type")
                        manager.linkReopend(repo, id, type)
                        call.respond(HttpStatusCode.OK)
                    }
                }
            }
        }
    }
}

private suspend fun RoutingContext.getId(): String? {
    val idParameter = call.parameters["id"]
    if (idParameter == null || (idParameter.length != 8 && idParameter != "local")) {
        call.respond(HttpStatusCode.BadRequest, "Missing or invalid ID")
        return null
    }
    return idParameter
}