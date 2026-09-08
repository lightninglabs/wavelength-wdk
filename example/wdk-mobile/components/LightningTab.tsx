import { Text, TextInput, TouchableOpacity, View } from 'react-native'

import { AppButton, Card, COLORS } from './ui'

export function LightningTab({
  lightningTab,
  setLightningTab,
  loading,
  invoiceAmount,
  setInvoiceAmount,
  invoiceMemo,
  setInvoiceMemo,
  handleCreateInvoice,
  generatedInvoice,
  copiedField,
  handleCopy,
  payInvoiceInput,
  setPayInvoiceInput,
  setPayInvoiceFee,
  handleQuoteInvoice,
  payInvoiceFee,
  handlePayInvoice,
}: {
  lightningTab: 'receive' | 'send'
  setLightningTab: (tab: 'receive' | 'send') => void
  loading: string | null
  invoiceAmount: string
  setInvoiceAmount: (value: string) => void
  invoiceMemo: string
  setInvoiceMemo: (value: string) => void
  handleCreateInvoice: () => void
  generatedInvoice: string | null
  copiedField: string | null
  handleCopy: (text: string, field: string) => void
  payInvoiceInput: string
  setPayInvoiceInput: (value: string) => void
  setPayInvoiceFee: (value: bigint | null) => void
  handleQuoteInvoice: () => void
  payInvoiceFee: bigint | null
  handlePayInvoice: () => void
}) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setLightningTab('receive')}
          style={{
            flex: 1,
            backgroundColor: lightningTab === 'receive' ? COLORS.accent : COLORS.border,
            paddingVertical: 10,
            borderRadius: 6,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: lightningTab === 'receive' ? COLORS.bg : COLORS.text, fontWeight: 'bold', fontSize: 13 }}>
            Receive
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setLightningTab('send')}
          style={{
            flex: 1,
            backgroundColor: lightningTab === 'send' ? COLORS.accent : COLORS.border,
            paddingVertical: 10,
            borderRadius: 6,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: lightningTab === 'send' ? COLORS.bg : COLORS.text, fontWeight: 'bold', fontSize: 13 }}>
            Pay Invoice
          </Text>
        </TouchableOpacity>
      </View>

      {lightningTab === 'receive' ? (
        <>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Amount (Satoshis)</Text>
            <TextInput
              placeholder="500"
              placeholderTextColor={COLORS.dim}
              value={invoiceAmount}
              onChangeText={setInvoiceAmount}
              keyboardType="numeric"
              editable={!loading}
              style={{
                backgroundColor: COLORS.bg,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 6,
                padding: 12,
                color: COLORS.text,
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Memo (optional)</Text>
            <TextInput
              placeholder="For coffee"
              placeholderTextColor={COLORS.dim}
              value={invoiceMemo}
              onChangeText={setInvoiceMemo}
              editable={!loading}
              style={{
                backgroundColor: COLORS.bg,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 6,
                padding: 12,
                color: COLORS.text,
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            />
          </View>

          <AppButton
            label="Generate Invoice"
            onPress={handleCreateInvoice}
            loading={loading === 'create-invoice'}
            variant="primary"
          />

          {generatedInvoice && (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 8 }}>Invoice</Text>
              <Text
                selectable
                style={{ color: COLORS.accent, fontSize: 11, fontFamily: 'monospace', lineHeight: 16, marginBottom: 12 }}
              >
                {generatedInvoice}
              </Text>
              <TouchableOpacity
                onPress={() => handleCopy(generatedInvoice, 'invoice')}
                style={{
                  backgroundColor: COLORS.border,
                  paddingVertical: 8,
                  borderRadius: 6,
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '600' }}>
                  {copiedField === 'invoice' ? 'Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Invoice (lnbc...)</Text>
            <TextInput
              placeholder="lnbc..."
              placeholderTextColor={COLORS.dim}
              value={payInvoiceInput}
              onChangeText={(text) => {
                setPayInvoiceInput(text)
                setPayInvoiceFee(null)
              }}
              editable={!loading}
              multiline
              style={{
                backgroundColor: COLORS.bg,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 6,
                padding: 12,
                color: COLORS.text,
                fontFamily: 'monospace',
                fontSize: 11,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <AppButton
            label="Get Fee Quote"
            onPress={handleQuoteInvoice}
            loading={loading === 'quote-invoice'}
            disabled={!payInvoiceInput}
            variant="secondary"
            style={{ paddingVertical: 10, marginBottom: 12 }}
          />

          {payInvoiceFee !== null && (
            <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
              Estimated fee: {payInvoiceFee.toString()} sats
            </Text>
          )}

          <AppButton
            label="Pay"
            onPress={handlePayInvoice}
            loading={loading === 'pay-invoice'}
            disabled={!payInvoiceInput}
            variant="danger"
          />
        </>
      )}
    </Card>
  )
}
