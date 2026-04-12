package com.fantamomo.server.amongus.model

enum class LogState {
    /**
     * The log was uploaded and can be accessed with a link
     */
    TEMPORARY,

    /**
     * The log has been used in an Issue or PR
     */
    LINKED,

    /**
     * The log has been used in an Issue or PR, but the it was closed (merged, mark as resolved, etc.)
     */
    ARCHIVED
}