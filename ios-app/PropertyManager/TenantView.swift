import SwiftUI
import LocalAuthentication

struct TenantView: View {
    var body: some View {
        VStack(spacing: 16) {
            ResidenceChip()
            PayRentWizard()
            MaintenanceRequestForm()
        }
    }
}

// MARK: - Residence chip

struct ResidenceChip: View {
    var body: some View {
        HStack(spacing: 11) {
            RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.bg).frame(width: 40, height: 40)
                .overlay(Image(systemName: "house.fill").font(.system(size: 16)).foregroundStyle(Theme.emerald))
            VStack(alignment: .leading, spacing: 2) {
                Text(MockData.residence.unitLabel).font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.textPrimary)
                Text(MockData.residence.leaseInfo).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Theme.textMuted)
            }
            Spacer(minLength: 6)
            Circle().fill(Theme.emerald).frame(width: 8, height: 8)
                .overlay(Circle().strokeBorder(Theme.emerald.opacity(0.15), lineWidth: 4).frame(width: 16, height: 16))
        }
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14))
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(cornerRadius: 16)
    }
}

// MARK: - Pay rent wizard

enum PayState { case idle, processing, success }

struct PayRentWizard: View {
    // Default idle; overridable for screenshots via `-payState success|processing`.
    @State private var state: PayState = {
        switch UserDefaults.standard.string(forKey: "payState") {
        case "success": return .success
        case "processing": return .processing
        default: return .idle
        }
    }()
    private let invoice = MockData.rentInvoice

    var body: some View {
        VStack {
            switch state {
            case .idle: idle
            case .processing: processing
            case .success: success
            }
        }
        .padding(EdgeInsets(top: 20, leading: 18, bottom: 20, trailing: 18))
        .frame(maxWidth: .infinity)
        .card(fill: AnyShapeStyle(Theme.heroGradient), cornerRadius: 22)
        .animation(.easeOut(duration: 0.25), value: state)
    }

    // Attempt real biometric auth; fall back to a simulated success so the flow
    // still demos on a simulator with no enrolled Face ID. Mirrors the design's
    // idle -> processing (~1.6s) -> success sequence.
    private func startPay() {
        state = .processing
        let ctx = LAContext()
        var err: NSError?
        let reason = "Authorize \(invoice.formattedAmount) rent payment"
        if ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) {
            ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    // Only settle on a real successful auth; failure/cancel returns to idle.
                    state = ok ? .success : .idle
                }
            }
        } else {
            // No biometrics enrolled (e.g. plain simulator): keep the demo flow.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { state = .success }
        }
    }

    private var idle: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rent due").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textSecondary)
                    Text(invoice.formattedAmount).font(.system(size: 34, weight: .heavy)).foregroundStyle(Theme.textPrimary).tracking(-1.2)
                }
                Spacer()
                Text(invoice.dueLabel).font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.amberLight)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.amber.opacity(0.14)))
            }
            .padding(.bottom, 16)

            // payment method row
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Theme.border).frame(width: 26, height: 18)
                    .overlay(Image(systemName: "creditcard.fill").font(.system(size: 9)).foregroundStyle(Theme.textSecondary))
                VStack(alignment: .leading, spacing: 1) {
                    Text(invoice.cardBrand).font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.textPrimary)
                    Text(invoice.autopayOn ? "Autopay on" : "Autopay off").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textMuted)
                }
                Spacer()
                Text("Change").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.emerald)
            }
            .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14))
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Theme.bg))
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            .padding(.bottom, 16)

            // Press-and-hold to authorize (matches the label); VoiceOver users get a
            // standard activate action instead of the hold gesture.
            HStack(spacing: 9) {
                Image(systemName: "faceid").font(.system(size: 17, weight: .semibold))
                Text("Hold to pay with Face ID").font(.system(size: 15, weight: .heavy))
            }
            .foregroundStyle(Theme.onEmerald)
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.emerald))
            .contentShape(Rectangle())
            .onLongPressGesture(minimumDuration: 0.4) { startPay() }
            .accessibilityElement()
            .accessibilityLabel("Pay \(invoice.formattedAmount) rent with Face ID")
            .accessibilityHint("Double-tap and hold to authorize")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { startPay() }

            Text("Secured · encrypted end-to-end").font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.textFaint).frame(maxWidth: .infinity).padding(.top, 11)
        }
    }

    private var processing: some View {
        VStack(spacing: 0) {
            Spinner().frame(width: 64, height: 64)
            Text("Verifying Face ID…").font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.textPrimary).padding(.top, 18)
            Text("Authorizing \(invoice.formattedAmount) payment").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.textMuted).padding(.top, 4)
        }
        .padding(.vertical, 18)
    }

    private var success: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(Theme.emerald.opacity(0.15)).frame(width: 70, height: 70)
                Image(systemName: "checkmark").font(.system(size: 30, weight: .heavy)).foregroundStyle(Theme.emeraldLight)
            }
            .transition(.scale.combined(with: .opacity))
            Text("Payment sent").font(.system(size: 18, weight: .heavy)).foregroundStyle(Theme.textPrimary).padding(.top, 16)
            Text("\(invoice.formattedAmount) · Receipt #RX-40921").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.textMuted).padding(.top, 3)
            Button { state = .idle } label: {
                Text("Done").font(.system(size: 13, weight: .bold)).foregroundStyle(Color(hex: 0xCBD5E1))
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.bg))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            }
            .buttonStyle(.plain).padding(.top, 16)
        }
        .padding(.vertical, 14)
    }
}

/// Indeterminate emerald ring spinner (design's `pmspin`).
struct Spinner: View {
    @State private var spin = false
    var body: some View {
        Circle()
            .trim(from: 0, to: 0.75)
            .stroke(Theme.emerald, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .background(Circle().stroke(Theme.border, lineWidth: 4))
            .rotationEffect(.degrees(spin ? 360 : 0))
            .animation(.linear(duration: 0.8).repeatForever(autoreverses: false), value: spin)
            .onAppear { spin = true }
    }
}

// MARK: - Maintenance request form

struct MaintenanceRequestForm: View {
    @State private var category: MaintenanceCategory = .plumbing
    @State private var desc: String = ""
    @State private var photoCount: Int = 0
    @State private var urgent: Bool = false
    @State private var submitted: Bool = false

    private var canSubmit: Bool { desc.trimmingCharacters(in: .whitespacesAndNewlines).count > 3 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Report an issue").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.textPrimary)
            if submitted { confirmation } else { form }
        }
        .animation(.easeOut(duration: 0.25), value: submitted)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Category chips
            VStack(alignment: .leading, spacing: 8) {
                Text("Category").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textSecondary)
                FlowChips(selected: $category)
            }
            // Description
            VStack(alignment: .leading, spacing: 8) {
                Text("Describe the issue").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textSecondary)
                ZStack(alignment: .topLeading) {
                    if desc.isEmpty {
                        Text("e.g. Kitchen faucet drips constantly and won't shut off")
                            .font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.textFaint)
                            .padding(EdgeInsets(top: 12, leading: 12, bottom: 0, trailing: 12))
                    }
                    TextEditor(text: $desc)
                        .font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.textPrimary)
                        .scrollContentBackground(.hidden)
                        .frame(height: 76).padding(6)
                }
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.bg))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            }
            // Photos
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Photos").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textSecondary)
                    Spacer()
                    Text("\(photoCount)/4").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.textFaint)
                }
                HStack(spacing: 8) {
                    ForEach(0..<photoCount, id: \.self) { i in PhotoThumb(index: i) { photoCount -= 1 } }
                    if photoCount < 4 { addPhoto }
                }
            }
            // Urgent toggle
            Button { urgent.toggle() } label: {
                HStack(spacing: 10) {
                    Image(systemName: urgent ? "checkmark.square.fill" : "square")
                        .font(.system(size: 18)).foregroundStyle(urgent ? Theme.amber : Theme.textMuted)
                    Text("Mark as urgent (safety / no water / no heat)")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: 0xCBD5E1))
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            // Submit
            Button { if canSubmit { submitted = true } } label: {
                Text("Submit request").font(.system(size: 14.5, weight: .heavy))
                    .foregroundStyle(canSubmit ? Theme.onEmerald : Theme.textFaint)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(canSubmit ? Theme.emerald : Color(hex: 0x1B2A3F)))
            }
            .buttonStyle(.plain).disabled(!canSubmit)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).card()
    }

    private var addPhoto: some View {
        Button { photoCount += 1 } label: {
            VStack(spacing: 2) {
                Image(systemName: "photo").font(.system(size: 18)).foregroundStyle(Theme.textMuted)
                Text("Add").font(.system(size: 9.5, weight: .bold)).foregroundStyle(Theme.textMuted)
            }
            .frame(width: 58, height: 58)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.bg))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1.5, dash: [4])))
        }
        .buttonStyle(.plain)
    }

    private var confirmation: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.emerald.opacity(0.15)).frame(width: 52, height: 52)
                .overlay(Image(systemName: "checkmark.circle").font(.system(size: 24, weight: .semibold)).foregroundStyle(Theme.emeraldLight))
            Text("Request submitted").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.textPrimary).padding(.top, 12)
            Text("Ticket #TR-1180 opened. Your property manager typically responds within 4 hours.")
                .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center).frame(maxWidth: 220).padding(.top, 3)
            Button {
                submitted = false; desc = ""; photoCount = 0; urgent = false; category = .plumbing
            } label: {
                Text("New request").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Color(hex: 0xCBD5E1))
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.bg))
                    .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            }
            .buttonStyle(.plain).padding(.top, 15)
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.emerald.opacity(0.4), lineWidth: 1))
    }
}

/// Wrapping category chips.
struct FlowChips: View {
    @Binding var selected: MaintenanceCategory
    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(MaintenanceCategory.allCases) { cat in
                let active = selected == cat
                Button { selected = cat } label: {
                    Text(cat.rawValue).font(.system(size: 12.5, weight: .bold))
                        .foregroundStyle(active ? Theme.emeraldLight : Theme.textSecondary)
                        .padding(.horizontal, 13).padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(active ? Theme.emerald.opacity(0.15) : Theme.bg))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(active ? Theme.emerald : Theme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct PhotoThumb: View {
    let index: Int
    let onRemove: () -> Void
    private let bgs: [(UInt, UInt)] = [(0x334155, 0x293548), (0x3A3020, 0x2E2818), (0x1E3A34, 0x173029), (0x233247, 0x1B2839)]
    var body: some View {
        let pair = bgs[index % bgs.count]
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(LinearGradient(colors: [Color(hex: pair.0), Color(hex: pair.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 58, height: 58)
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
                        .frame(width: 19, height: 19).background(Circle().fill(Theme.red))
                        .overlay(Circle().strokeBorder(Theme.card, lineWidth: 2))
                        .contentShape(Rectangle().inset(by: -12))   // enlarge hit target past the 19pt glyph
                }
                .buttonStyle(.plain).offset(x: 5, y: -5)
                .accessibilityLabel("Remove photo \(index + 1)")
            }
    }
}
