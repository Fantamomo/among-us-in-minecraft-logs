package com.fantamomo.server.amongus.app

import io.ktor.server.application.*
import io.ktor.server.plugins.cachingheaders.*

fun Application.configureHTTP() {
    install(CachingHeaders)
}
