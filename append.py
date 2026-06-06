import sys

content = """
model SystemState {
  id                String   @id @default("GLOBAL")
  simulatedTimeUnix Float    @default(1780287120.0)
  updatedAt         DateTime @updatedAt
}
"""

with open('server/prisma/schema.prisma', 'a', encoding='utf-8') as f:
    f.write(content)
