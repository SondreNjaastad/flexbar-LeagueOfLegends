/**
 * Utility Functions
 * Common utility functions used across the plugin
 */

/**
 * Truncates text to fit within a maximum width
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {string} text Text to truncate
 * @param {number} maxWidth Maximum width in pixels
 * @returns {string} Truncated text
 */
function truncateText(ctx, text, maxWidth) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

/**
 * Draws a rounded rectangle on the canvas
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x X position
 * @param {number} y Y position
 * @param {number} width Width
 * @param {number} height Height
 * @param {number} radius Corner radius
 */
function roundedRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

/**
 * Decodes HTML entities in a string
 * @param {string} text Text to decode
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

module.exports = {
    truncateText,
    roundedRect,
    decodeHtmlEntities
}; 