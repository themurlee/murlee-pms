import SwiftUI

/// Design tokens ported from the Claude Design source `PropertyManager.dc.html`.
/// Palette is the Tailwind "slate + emerald" dark scheme the web frontend also uses.
enum Theme {
    // Surfaces
    static let bg = Color(hex: 0x0F172A)           // slate-900 — app background / inner wells
    static let card = Color(hex: 0x1E293B)          // slate-800 — cards
    static let cardTop = Color(hex: 0x1E293B)       // hero gradient start
    static let cardBottom = Color(hex: 0x172033)    // hero gradient end
    static let border = Color(hex: 0x334155)        // slate-700 — hairline borders

    // Text
    static let textPrimary = Color(hex: 0xF1F5F9)   // slate-100
    static let textSecondary = Color(hex: 0x94A3B8) // slate-400
    static let textMuted = Color(hex: 0x64748B)     // slate-500
    static let textFaint = Color(hex: 0x475569)     // slate-600

    // Accent
    static let emerald = Color(hex: 0x10B981)
    static let emeraldLight = Color(hex: 0x34D399)
    static let onEmerald = Color(hex: 0x052E2B)     // dark text placed on emerald fills

    // Semantic
    static let amber = Color(hex: 0xF59E0B)
    static let amberLight = Color(hex: 0xFBBF24)
    static let red = Color(hex: 0xEF4444)
    static let redLight = Color(hex: 0xF87171)
    static let sky = Color(hex: 0x38BDF8)

    static let heroGradient = LinearGradient(
        colors: [cardTop, cardBottom],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let emeraldGradient = LinearGradient(
        colors: [emerald, emeraldLight],
        startPoint: .leading, endPoint: .trailing
    )
}

extension Color {
    /// Hex initializer, e.g. `Color(hex: 0x10B981)`.
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

/// Rounded card container matching the mockup's `border-radius` + `1px` border cards.
struct CardBackground: ViewModifier {
    var fill: AnyShapeStyle = AnyShapeStyle(Theme.card)
    var cornerRadius: CGFloat = 18
    func body(content: Content) -> some View {
        content.background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }
}

extension View {
    func card(fill: AnyShapeStyle = AnyShapeStyle(Theme.card), cornerRadius: CGFloat = 18) -> some View {
        modifier(CardBackground(fill: fill, cornerRadius: cornerRadius))
    }
}
