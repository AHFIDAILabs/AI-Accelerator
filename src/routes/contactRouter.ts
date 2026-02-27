import { Router } from 'express'
import { protect } from '../middlewares/auth'
import {
  submitContactForm,
  getContactMessages,
  markContactRead,
  replyToContact,
  deleteContactMessage,
} from '../controllers/contactController'

const contactRouter = Router()

// ── Public ────────────────────────────────────────────────────────────────────
contactRouter.post('/', submitContactForm)

// ── Admin only ────────────────────────────────────────────────────────────────
contactRouter.get('/',              protect, getContactMessages)
contactRouter.patch('/:id/read',    protect, markContactRead)
contactRouter.post('/:id/reply',    protect, replyToContact)     
contactRouter.delete('/:id',        protect, deleteContactMessage)

export default contactRouter
