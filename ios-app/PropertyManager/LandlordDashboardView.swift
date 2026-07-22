import SwiftUI

struct LandlordDashboardView: View {
    @State private var expandedTicket: Int? = 1

    private var sortedTickets: [MaintenanceTicket] {
        MockData.tickets.sorted { $0.priority.rank < $1.priority.rank }
    }

    var body: some View {
        VStack(spacing: 16) {
            RevenueHeroCard()
            KPIPair()

            SectionHeader(title: "Your properties", trailing: "3 assets", trailingColor: Theme.emerald)
            PropertyCarousel()

            SectionHeader(title: "Maintenance queue", trailing: "by priority", trailingColor: Theme.textMuted)
            VStack(spacing: 9) {
                ForEach(sortedTickets) { ticket in
                    TicketRow(
                        ticket: ticket,
                        expanded: expandedTicket == ticket.id,
                        onToggle: {
                            expandedTicket = expandedTicket == ticket.id ? nil : ticket.id
                        }
                    )
                }
            }
        }
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    let trailing: String
    var trailingColor: Color = Theme.textMuted
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.textPrimary)
            Spacer()
            Text(trailing).font(.system(size: 12, weight: .semibold)).foregroundStyle(trailingColor)
        }
    }
}

// MARK: - Revenue hero

struct RevenueHeroCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Revenue collected · July")
                        .font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textSecondary)
                    Text("$48,250")
                        .font(.system(size: 30, weight: .heavy)).foregroundStyle(Theme.textPrimary)
                        .tracking(-1)
                }
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 11, weight: .heavy))
                    Text("12.4%").font(.system(size: 12, weight: .bold))
                }
                .foregroundStyle(Theme.emeraldLight)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.emerald.opacity(0.14)))
            }

            // weekly bar chart
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(MockData.revenueBars) { bar in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(bar.highlighted
                              ? AnyShapeStyle(LinearGradient(colors: [Theme.emeraldLight, Theme.emerald], startPoint: .top, endPoint: .bottom))
                              : AnyShapeStyle(Theme.emerald.opacity(0.28)))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44 * bar.fraction)
                }
            }
            .frame(height: 44, alignment: .bottom)
            .padding(.top, 14)

            HStack {
                ForEach(MockData.revenueBars) { bar in
                    Text(bar.dayLabel).font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.textFaint).frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 6)
        }
        .padding(EdgeInsets(top: 18, leading: 18, bottom: 16, trailing: 18))
        .card(fill: AnyShapeStyle(Theme.heroGradient), cornerRadius: 20)
    }
}

// MARK: - KPI pair

struct KPIPair: View {
    var body: some View {
        HStack(spacing: 12) {
            occupancy
            openTickets
        }
    }

    private var occupancy: some View {
        VStack(alignment: .leading, spacing: 0) {
            kpiLabel(icon: "house.fill", tint: Theme.emerald, text: "Occupancy")
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("94").font(.system(size: 26, weight: .heavy)).foregroundStyle(Theme.textPrimary).tracking(-0.5)
                Text("%").font(.system(size: 15)).foregroundStyle(Theme.textMuted)
            }
            .padding(.top, 2)
            ProgressBar(fraction: 0.94).padding(.top, 10)
            Text("68 / 72 units leased").font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.textMuted).padding(.top, 7)
        }
        .padding(15).frame(maxWidth: .infinity, alignment: .leading).card()
    }

    private var openTickets: some View {
        VStack(alignment: .leading, spacing: 0) {
            kpiLabel(icon: "wrench.and.screwdriver.fill", tint: Theme.amber, text: "Open tickets")
            Text("7").font(.system(size: 26, weight: .heavy)).foregroundStyle(Theme.textPrimary).tracking(-0.5).padding(.top, 2)
            HStack(spacing: 5) {
                pill("2 High", Theme.red)
                pill("3 Med", Theme.amber)
            }
            .padding(.top, 12)
            Text("2 resolved today").font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.textMuted).padding(.top, 9)
        }
        .padding(15).frame(maxWidth: .infinity, alignment: .leading).card()
    }

    private func kpiLabel(icon: String, tint: Color, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
            Text(text).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textSecondary)
        }
        .padding(.bottom, 10)
    }

    private func pill(_ text: String, _ color: Color) -> some View {
        Text(text).font(.system(size: 10, weight: .bold)).foregroundStyle(color)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(color.opacity(0.15)))
    }
}

struct ProgressBar: View {
    let fraction: CGFloat
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.bg)
                Capsule().fill(Theme.emeraldGradient).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 6)
    }
}

// MARK: - Property carousel

struct PropertyCarousel: View {
    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                ForEach(MockData.properties) { PropertyCard(property: $0) }
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
        .padding(.horizontal, -20)   // bleed to screen edges like the mockup
    }
}

struct PropertyCard: View {
    let property: Property
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                Rectangle().fill(property.health.stripe).frame(height: 82)
                Text(property.health.label)
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(property.health.badgeText)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(property.health.badgeBg))
                    .padding(10)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(property.nickname).font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.textPrimary)
                Text("\(property.unitCount) units · \(property.addressShort)")
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textMuted)
                HStack {
                    stat("Occupied", property.occupied, Theme.textPrimary, alignment: .leading)
                    Spacer()
                    stat("Monthly", property.monthly, Theme.emeraldLight, alignment: .trailing)
                }
                .padding(.top, 12)
                .overlay(Rectangle().fill(Theme.border).frame(height: 1), alignment: .top)
                .padding(.top, 11)
            }
            .padding(EdgeInsets(top: 12, leading: 13, bottom: 13, trailing: 13))
        }
        .frame(width: 200)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ color: Color, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.textSecondary)
            Text(value).font(.system(size: 14, weight: .heavy)).foregroundStyle(color)
        }
    }
}

// MARK: - Maintenance queue row (expandable)

struct TicketRow: View {
    let ticket: MaintenanceTicket
    let expanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 11, style: .continuous).fill(ticket.priority.iconBg).frame(width: 38, height: 38)
                        Circle().fill(ticket.priority.color).frame(width: 8, height: 8)
                            .overlay(Circle().strokeBorder(ticket.priority.iconBg, lineWidth: 4).frame(width: 16, height: 16))
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ticket.title).font(.system(size: 13.5, weight: .bold))
                            .foregroundStyle(Theme.textPrimary).lineLimit(1)
                        Text(ticket.location).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textMuted)
                    }
                    Spacer(minLength: 6)
                    Text(ticket.priority.full).font(.system(size: 10, weight: .bold)).foregroundStyle(ticket.priority.color)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(ticket.priority.badgeBg))
                    Image(systemName: "chevron.down").font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.textFaint)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(EdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14))
            }
            .buttonStyle(.plain)

            if expanded { detail }
        }
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: expanded)
    }

    private var detail: some View {
        VStack(spacing: 9) {
            detailRow("Reported", ticket.reported)
            detailRow("Assigned to", ticket.assignee)
            detailRow("Est. cost", ticket.cost)
            HStack(spacing: 9) {
                Button { } label: {
                    Text("Dispatch crew").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Theme.onEmerald)
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.emerald))
                }.buttonStyle(.plain)
                Button { } label: {
                    Text("Message").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Color(hex: 0xCBD5E1))
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.bg))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
                }.buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 14, trailing: 14))
        .overlay(Rectangle().fill(Theme.border).frame(height: 1), alignment: .top)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textMuted)
            Spacer()
            Text(value).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color(hex: 0xCBD5E1))
        }
    }
}
