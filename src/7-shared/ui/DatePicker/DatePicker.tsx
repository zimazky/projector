import React from 'react'

import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import TextField from 'src/7-shared/ui/TextField/TextField'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'

import styles from './DatePicker.module.css'

type DatePickerProps = {
  label: string
  value: string
  onChange?: () => void
}

const DatePicker: React.FC<DatePickerProps> = ({label, value, onChange = ()=>{}}) => {
  const [open, setOpen] = React.useState(false)
  const rest = {onSelect: ()=>{setOpen(true)}}
  return <>
  <TextField label={label} {...rest}></TextField>
  <Dialog open={open} onClose={()=>setOpen(false)}>
    <DialogContent>ffjfkfflf</DialogContent>
    <DialogActions>
      <TextButton onClick={()=>setOpen(false)}>Cancel</TextButton>
      <TextButton>Ok</TextButton>
    </DialogActions>
  </Dialog>
  </>
}

export default DatePicker