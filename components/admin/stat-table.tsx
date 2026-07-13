import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type StatTableColumn = {
  key: string
  label: string
  align?: "left" | "right"
}

export type StatTableRow = {
  id: string
  cells: Record<string, ReactNode>
}

export function StatTable({
  caption,
  className,
  columns,
  emptyLabel,
  heading,
  rows,
}: Readonly<{
  caption: string
  className?: string
  columns: StatTableColumn[]
  emptyLabel: string
  heading: string
  rows: StatTableRow[]
}>) {
  return (
    <Card className={cn("gap-4 py-5", className)}>
      <CardHeader>
        <CardTitle className="text-base">{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                      {row.cells[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={columns.length}>
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
