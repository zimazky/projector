import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreContext'
import LegacyEventForm from './LegacyEventForm'
import ResourceEventForm from './ResourceEventForm'

const EventForm = observer(function EventForm() {
	const { eventFormStore } = useStores()
	return eventFormStore.resourceAccounting ? (
		<ResourceEventForm key={eventFormStore.formKey} />
	) : (
		<LegacyEventForm key={eventFormStore.formKey} />
	)
})
export default EventForm
