import React from 'react'
import styled from 'styled-components'
import IconMenu from './IconMenu'

const StyledButton = styled.button`
  border: none;
  background: none;
  margin-right: 0.5em;
  height: 2em;
  width: 2em;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
`

export default props => (
  <StyledButton {...props}>
    <IconMenu />
  </StyledButton>
)
