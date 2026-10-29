package com.vidarmartensson.veloqos

import org.junit.Assert.assertEquals
import org.junit.Test

/** The tab icon parser only needs to tokenise correctly; drawing is covered by Maestro. */
class IconPathTest {
    @Test
    fun `tokenises compact SVG paths`() {
        val tokens = Regex("[MLHVZmlhvz]|-?\\d*\\.?\\d+").findAll("M4 11l8-7 8 7v9h-5v-6H9v6H4z").map { it.value }.toList()
        assertEquals(listOf("M", "4", "11", "l", "8", "-7", "8", "7", "v", "9", "h", "-5", "v", "-6", "H", "9", "v", "6", "H", "4", "z"), tokens)
    }
}
