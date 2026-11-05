<?php
/**
 * Plugin Name: QuickSolutionsPro Analytics Bridge
 * Description: First-party analytics tracking for the QuickSolutions Control Center. Lightweight, async, no external dependencies.
 * Version: 1.0.0
 * Author: QuickSolutions
 * License: Proprietary
 *
 * This plugin injects the QS Analytics tracker script into all frontend pages.
 * The tracker sends page views, WooCommerce events, and session data to the
 * Control Center dashboard for realtime analytics, conversion tracking, and AI insights.
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
define('QS_ANALYTICS_TRACKER_URL', 'https://quicksolutions-dashboard.vercel.app/qs-analytics.js');
define('QS_ANALYTICS_SCRIPT_PRIORITY', 20); // Load after jQuery but before most plugins

/**
 * Enqueue the analytics tracker script on all frontend pages.
 */
function qs_analytics_enqueue_tracker() {
    // Only on frontend, never in admin
    if (is_admin()) {
        return;
    }

    wp_enqueue_script(
        'qs-analytics-tracker',
        QS_ANALYTICS_TRACKER_URL,
        array(),   // No dependencies — runs standalone
        '1.0.0',
        true       // Load in footer — non-blocking
    );

    // Add async attribute to prevent render-blocking
    add_filter('script_loader_tag', function ($tag, $handle) {
        if ($handle === 'qs-analytics-tracker') {
            return str_replace(' src', ' async src', $tag);
        }
        return $tag;
    }, 10, 2);
}
add_action('wp_enqueue_scripts', 'qs_analytics_enqueue_tracker', QS_ANALYTICS_SCRIPT_PRIORITY);

/**
 * Add user identification when customer is logged in (WooCommerce).
 */
function qs_analytics_identify_user() {
    if (!is_admin() && is_user_logged_in()) {
        $user = wp_get_current_user();
        ?>
        <script>
        if (window.QSAnalytics) {
            window.QSAnalytics.identify(
                '<?php echo esc_js($user->ID); ?>',
                {
                    name: '<?php echo esc_js($user->display_name); ?>',
                    email: '<?php echo esc_js($user->user_email); ?>',
                    customer_since: '<?php echo esc_js($user->user_registered); ?>'
                }
            );
        }
        </script>
        <?php
    }
}
add_action('wp_footer', 'qs_analytics_identify_user', 99);

/**
 * Add order tracking on thank-you page.
 */
function qs_analytics_track_order() {
    if (!is_wc_endpoint_url('order-received')) {
        return;
    }

    global $wp;
    $order_id = absint($wp->query_vars['order-received'] ?? 0);

    if (!$order_id) {
        return;
    }

    $order = wc_get_order($order_id);
    if (!$order) {
        return;
    }

    $items = array();
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        $items[] = array(
            'id' => $product ? $product->get_id() : 0,
            'name' => $item->get_name(),
            'quantity' => $item->get_quantity(),
            'price' => floatval($order->get_item_total($item, false, true)),
            'sku' => $product ? $product->get_sku() : '',
        );
    }

    $order_data = array(
        'order_id' => $order_id,
        'total' => floatval($order->get_total()),
        'subtotal' => floatval($order->get_subtotal()),
        'tax' => floatval($order->get_total_tax()),
        'shipping' => floatval($order->get_shipping_total()),
        'currency' => $order->get_currency(),
        'coupon' => implode(',', $order->get_coupon_codes()),
        'payment_method' => $order->get_payment_method(),
        'items' => $items,
        'items_count' => $order->get_item_count(),
    );

    // Send server-side purchase event — reliable, has full order data,
    // and won't double-fire with the JS tracker (which no longer auto-detects purchases).
    qs_analytics_server_side_event('purchase', array(
        'order_id' => strval($order_id),
        'total' => floatval($order->get_total()),
        'currency' => $order->get_currency(),
        'items_count' => $order->get_item_count(),
        'payment_method' => $order->get_payment_method(),
        'coupons' => $order->get_coupon_codes(),
    ));
}
add_action('wp_footer', 'qs_analytics_track_order', 99);

/**
 * Server-side event relay (fallback when client JS fails).
 */
function qs_analytics_server_side_event($event_name, $properties = array()) {
    $endpoint = 'https://quicksolutions-dashboard.vercel.app/api/analytics/ingest';

    $session_id = 'ss_' . substr(md5(uniqid('qs', true)), 0, 16);
    $visitor_id = 'ss_' . substr(md5(
        $_SERVER['REMOTE_ADDR'] . ($_SERVER['HTTP_USER_AGENT'] ?? '')
    ), 0, 16);

    $payload = array(
        'eventName' => $event_name,
        'sessionId' => $session_id,
        'visitorId' => $visitor_id,
        'occurredAt' => gmdate('c'),
        'properties' => array_merge($properties, array(
            'page_url' => (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? ''),
            'source' => 'server_side',
        )),
    );

    wp_remote_post($endpoint, array(
        'body' => json_encode($payload),
        'headers' => array('Content-Type' => 'application/json'),
        'timeout' => 3,
        'blocking' => false, // Non-blocking — don't slow down page load
    ));
}
