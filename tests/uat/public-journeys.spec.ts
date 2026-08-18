import { expect, test } from '@playwright/test'

test.describe('public user journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('a visitor can discover services and start a quote request', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /make space for what comes next/i })).toBeVisible()
    await page.getByRole('button', { name: /services/i }).first().click()
    await expect(page.getByRole('heading', { name: /services for/i })).toBeVisible()
    await expect(page.getByText('Apartment turnover')).toBeVisible()
    await expect(page.getByText('Disinfection and sanitation')).toBeVisible()
    await page.getByRole('button', { name: /request a quote/i }).first().click()
    await expect(page.getByRole('heading', { name: /request a quote/i })).toBeVisible()
  })

  test('a visitor can submit a complete quote request and sees the next step', async ({ page }) => {
    await page.getByRole('button', { name: /request a quote/i }).first().click()
    await page.getByLabel('Service').selectOption({ label: 'Apartment turnover' })
    await page.getByLabel('Property type').selectOption({ label: 'Apartment or multifamily' })
    await page.getByLabel(/approx\. rooms/i).fill('8')
    await page.getByLabel('Address or neighborhood').fill('North Loop, Minneapolis')
    await page.getByLabel(/preferred date/i).fill('2026-09-01')
    await page.getByLabel('Name').fill('Jordan Smith')
    await page.getByLabel('Email').fill('jordan@example.test')
    await page.getByLabel('Phone').fill('6125550100')
    await page.getByRole('button', { name: /send request/i }).click()
    await expect(page.getByRole('status')).toContainText(/request received/i)
    await expect(page.getByText(/operator will review/i)).toBeVisible()
  })
})
