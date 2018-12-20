import React from 'react'
import styled from 'styled-components'
import Icon from './Icon'

const StyledButton = styled.button`
  border: none;
  background: none;
  height: 2.5em;
  width: 2.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
`

export default props => (
  <StyledButton {...props}>
    <Icon />
  </StyledButton>
)
