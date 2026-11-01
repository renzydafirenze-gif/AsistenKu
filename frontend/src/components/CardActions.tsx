import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';

interface CardActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteHint?: string;
  extra?: React.ReactNode;
}

/** Ubah/Hapus row shared by the editable list cards. */
export function CardActions({ onEdit, onDelete, deleteDisabled, deleteHint, extra }: CardActionsProps) {
  return (
    <View style={styles.row}>
      {onEdit ? (
        <View style={styles.cell}>
          <PrimaryButton label="Ubah" tone="ghost" onPress={onEdit} />
        </View>
      ) : null}
      {onDelete ? (
        <View style={styles.cell}>
          <PrimaryButton
            label="Hapus"
            tone="danger"
            onPress={onDelete}
            disabled={deleteDisabled}
            accessibilityHint={deleteHint}
          />
        </View>
      ) : null}
      {extra ? <View style={styles.cell}>{extra}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cell: { flex: 1 },
});
