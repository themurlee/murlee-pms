import SwiftUI

/// Top-level shell: greeting header, Landlord/Tenant segmented switch, scrollable
/// role content, and the bottom tab bar. Adaptive to real safe areas (no fake
/// phone chrome from the design source).
struct RootView: View {
    // Default Landlord; overridable for screenshots/UI tests via `-startRole tenant`.
    @State private var role: Role = UserDefaults.standard.string(forKey: "startRole") == "tenant" ? .tenant : .landlord

    /// Time-of-day greeting for the landlord header.
    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12:  return "GOOD MORNING"
        case 12..<17: return "GOOD AFTERNOON"
        default:      return "GOOD EVENING"
        }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                RoleSwitch(role: $role)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)

                ScrollView {
                    Group {
                        switch role {
                        case .landlord: LandlordDashboardView()
                        case .tenant: TenantView()
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
                    .padding(.bottom, 96)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .id(role)          // re-trigger the slide-in animation on switch
                }
                .scrollIndicators(.hidden)
            }

            VStack { Spacer(); TabBar(role: role) }
        }
        .animation(.easeOut(duration: 0.3), value: role)
        .tint(Theme.emerald)
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(role == .landlord ? greeting : "WELCOME BACK")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.3)
                    .foregroundStyle(Theme.textMuted)
                Text(role == .landlord ? "\(MockData.landlordName)'s portfolio" : "Hi, \(MockData.tenantName)")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(Theme.textPrimary)
            }
            Spacer()
            HStack(spacing: 10) {
                bell
                avatar
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    private var bell: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Theme.card)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: "bell.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.textSecondary)
                )
            Circle()
                .fill(Theme.amber)
                .frame(width: 7, height: 7)
                .overlay(Circle().strokeBorder(Theme.card, lineWidth: 2).frame(width: 11, height: 11))
                .offset(x: -8, y: 8)
        }
        .accessibilityElement()
        .accessibilityLabel("Notifications")
        .accessibilityValue("1 unread")
        .accessibilityAddTraits(.isButton)
    }

    private var avatar: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(LinearGradient(colors: [Theme.emerald, Color(hex: 0x0D9488)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 40, height: 40)
            .overlay(
                Text(String((role == .landlord ? MockData.landlordName : MockData.tenantName).prefix(1)))
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(Theme.onEmerald)
            )
    }
}

/// Segmented Landlord/Tenant control (custom to match the emerald active pill).
struct RoleSwitch: View {
    @Binding var role: Role

    var body: some View {
        HStack(spacing: 4) {
            segment(.landlord, system: "building.2.fill", label: "Landlord")
            segment(.tenant, system: "person.fill", label: "Tenant")
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.card)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        )
    }

    private func segment(_ target: Role, system: String, label: String) -> some View {
        let active = role == target
        return Button {
            role = target
        } label: {
            HStack(spacing: 7) {
                Image(systemName: system).font(.system(size: 13, weight: .semibold))
                Text(label).font(.system(size: 13.5, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .foregroundStyle(active ? Theme.onEmerald : Theme.textMuted)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(active ? AnyShapeStyle(Theme.emerald) : AnyShapeStyle(Color.clear))
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label) view")
        .accessibilityAddTraits(active ? [.isSelected] : [])
    }
}

/// Bottom navigation. Labels adapt to the active role (Rent vs Payments).
struct TabBar: View {
    let role: Role

    private var items: [(String, String)] {
        [
            ("house.fill", "Home"),
            ("building.columns.fill", role == .landlord ? "Rent" : "Payments"),
            ("doc.text.fill", "Requests"),
            ("person.crop.circle.fill", "Profile"),
        ]
    }

    var body: some View {
        HStack {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                VStack(spacing: 4) {
                    Image(systemName: item.0).font(.system(size: 18))
                    Text(item.1).font(.system(size: 10, weight: idx == 0 ? .bold : .semibold))
                }
                .foregroundStyle(idx == 0 ? Theme.emerald : Theme.textFaint)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 10)
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
        .background(.ultraThinMaterial)
        .overlay(Rectangle().fill(Theme.card).frame(height: 1), alignment: .top)
    }
}

#Preview { RootView() }
