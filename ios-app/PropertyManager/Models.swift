import SwiftUI

// MARK: - Roles

enum Role: String, CaseIterable, Identifiable {
    case landlord, tenant
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

// MARK: - Priority (maps to maintenance_tickets.priority: high|medium|low)

enum Priority: String, CaseIterable, Identifiable {
    case high, medium, low
    var id: String { rawValue }
    var label: String {
        switch self {
        case .high: return "High"
        case .medium: return "Med"
        case .low: return "Low"
        }
    }
    var full: String { rawValue.capitalized }

    var color: Color {
        switch self {
        case .high: return Theme.red
        case .medium: return Theme.amber
        case .low: return Theme.sky
        }
    }
    var badgeBg: Color { color.opacity(0.15) }
    var iconBg: Color { color.opacity(0.12) }
    /// Sort order used by the "by priority" maintenance queue.
    var rank: Int { switch self { case .high: 0; case .medium: 1; case .low: 2 } }
}

// MARK: - Property (properties + derived occupancy/revenue)

enum PropertyHealth {
    case healthy, fullyLeased, needsAttention
    var label: String {
        switch self {
        case .healthy: return "Healthy"
        case .fullyLeased: return "Fully leased"
        case .needsAttention: return "Needs attention"
        }
    }
    var badgeBg: Color {
        switch self {
        case .healthy: return Theme.emerald.opacity(0.85)
        case .fullyLeased: return Color(hex: 0xCBD5E1).opacity(0.9)
        case .needsAttention: return Theme.amber.opacity(0.9)
        }
    }
    var badgeText: Color {
        switch self {
        case .healthy: return Theme.onEmerald
        case .fullyLeased: return Theme.bg
        case .needsAttention: return Color(hex: 0x3A2600)
        }
    }
    /// Diagonal stripe fill standing in for a property photo (matches mockup).
    var stripe: LinearGradient {
        let pair: (UInt, UInt)
        switch self {
        case .healthy: pair = (0x1E3A34, 0x173029)
        case .fullyLeased: pair = (0x233247, 0x1B2839)
        case .needsAttention: pair = (0x3A2E1A, 0x2E2415)
        }
        return LinearGradient(colors: [Color(hex: pair.0), Color(hex: pair.1)],
                              startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

struct Property: Identifiable {
    let id = UUID()
    let nickname: String       // properties.nickname
    let addressShort: String   // properties.address (street)
    let unitCount: Int
    let occupiedUnits: Int
    var occupied: String { "\(occupiedUnits)/\(unitCount)" }   // "22/24"
    let monthly: String        // formatted monthly revenue
    let health: PropertyHealth
}

// MARK: - Maintenance ticket (maintenance_tickets)

enum MaintenanceCategory: String, CaseIterable, Identifiable {
    case plumbing = "Plumbing"
    case electrical = "Electrical"
    case appliance = "Appliance"
    case hvac = "HVAC"
    case other = "Other"
    var id: String { rawValue }
}

struct MaintenanceTicket: Identifiable {
    let id: Int
    let title: String          // issue_description (short)
    let location: String       // property · unit
    let priority: Priority
    let reported: String       // reported_at, humanized
    let assignee: String
    let cost: String           // est. cost range
}

// MARK: - Tenant residence + invoice (leases + invoices/breakdown)

struct Residence {
    let unitLabel: String      // "Unit 4B · Oakridge Apartments"
    let leaseInfo: String      // "Lease active · renews Mar 2027"
}

/// Mirrors the `GET /api/invoices` element shape (subset used by the pay screen).
struct RentInvoice {
    let id: String
    let amountDue: Double       // breakdown.total_due
    let dueLabel: String        // "Due Aug 1"
    let cardBrand: String       // "Visa ·· 4821"
    let autopayOn: Bool
    var formattedAmount: String { "$" + (Self.currency.string(from: amountDue as NSNumber) ?? "\(Int(amountDue))") }

    static let currency: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()
}

// MARK: - Revenue bar (dashboard weekly chart)

struct RevenueBar: Identifiable {
    let id = UUID()
    let fraction: CGFloat       // 0...1 height
    let highlighted: Bool       // weekend bars use the solid emerald gradient
    let dayLabel: String
}

// MARK: - Mock data (mirrors the design; swap for APIClient hitting /api/invoices later)

enum MockData {
    static let landlordName = "Marcus"
    static let tenantName = "Elena"

    static let revenueBars: [RevenueBar] = zip(
        [0.40, 0.62, 0.55, 0.78, 0.70, 0.92, 0.84],
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    ).enumerated().map { idx, pair in
        RevenueBar(fraction: pair.0, highlighted: idx >= 5, dayLabel: pair.1)
    }

    static let properties: [Property] = [
        Property(nickname: "Oakridge Apartments", addressShort: "Elm St", unitCount: 24,
                 occupiedUnits: 22, monthly: "$41.2k", health: .healthy),
        Property(nickname: "Maple Court", addressShort: "Maple Ave", unitCount: 12,
                 occupiedUnits: 12, monthly: "$19.8k", health: .fullyLeased),
        Property(nickname: "Birchwood Res.", addressShort: "Birch Ln", unitCount: 36,
                 occupiedUnits: 31, monthly: "$52.4k", health: .needsAttention),
    ]

    /// Unsorted; the queue view sorts by `priority.rank` to match "by priority".
    static let tickets: [MaintenanceTicket] = [
        MaintenanceTicket(id: 1, title: "Water leak under kitchen sink", location: "Oakridge · Unit 4B",
                          priority: .high, reported: "2h ago", assignee: "Unassigned", cost: "$180–$320"),
        MaintenanceTicket(id: 2, title: "HVAC not cooling", location: "Maple Court · Unit 12",
                          priority: .high, reported: "5h ago", assignee: "CoolAir Co.", cost: "$450"),
        MaintenanceTicket(id: 3, title: "Broken cabinet hinge", location: "Oakridge · Unit 2A",
                          priority: .medium, reported: "Yesterday", assignee: "J. Rivera", cost: "$60"),
        MaintenanceTicket(id: 4, title: "Flickering hallway light", location: "Birchwood · Floor 3",
                          priority: .medium, reported: "2d ago", assignee: "Unassigned", cost: "$90"),
        MaintenanceTicket(id: 5, title: "Squeaky bedroom door", location: "Maple Court · Unit 7",
                          priority: .low, reported: "3d ago", assignee: "J. Rivera", cost: "$25"),
    ]

    static let residence = Residence(
        unitLabel: "Unit 4B · Oakridge Apartments",
        leaseInfo: "Lease active · renews Mar 2027"
    )

    static let rentInvoice = RentInvoice(
        id: "INV-001", amountDue: 1850, dueLabel: "Due Aug 1",
        cardBrand: "Visa ·· 4821", autopayOn: false
    )

    // MARK: Dashboard KPI aggregates (derived from properties/tickets above)

    static var totalUnits: Int { properties.reduce(0) { $0 + $1.unitCount } }
    static var occupiedUnits: Int { properties.reduce(0) { $0 + $1.occupiedUnits } }
    static var occupancyFraction: CGFloat {
        totalUnits == 0 ? 0 : CGFloat(occupiedUnits) / CGFloat(totalUnits)
    }
    static var occupancyPercent: Int { Int((occupancyFraction * 100).rounded()) }

    static var openTicketCount: Int { tickets.count }
    static func ticketCount(of priority: Priority) -> Int {
        tickets.filter { $0.priority.rawValue == priority.rawValue }.count
    }

    // Not backed by MockData yet; keep as named placeholders until real revenue/ticket-resolution data exists.
    static let monthlyRevenueDisplay = "$48,250"   // TODO: derive from real invoice/payment data
    static let revenueGrowthDisplay = "12.4%"      // TODO: derive from real invoice/payment data
    static let resolvedTodayDisplay = "2 resolved today"   // TODO: derive from real ticket-resolution data
}
